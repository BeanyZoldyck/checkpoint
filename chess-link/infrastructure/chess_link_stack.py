from aws_cdk import (
    Stack,
    Duration,
    Expiration,
    CfnOutput,
    aws_appsync as appsync,
    aws_lambda as _lambda,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_s3_notifications as s3n,
    aws_iam as iam,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_logs as logs,
)
from constructs import Construct


class CheckpointStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # S3 Bucket for board images
        images_bucket = s3.Bucket(
            self,
            "CheckpointImages",
            bucket_name=f"checkpoint-images-{self.account}-{self.region}",
            cors=[
                s3.CorsRule(
                    allowed_origins=["*"],
                    allowed_methods=[
                        s3.HttpMethods.GET,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.PUT,
                    ],
                    allowed_headers=["*"],
                    max_age=300,
                )
            ],
        )

        # DynamoDB table for games
        games_table = dynamodb.Table(
            self,
            "CheckpointGames",
            table_name="checkpoint-games",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            point_in_time_recovery=True,
            deletion_protection=False,  # For development
        )

        # Add GSI for join code lookups
        games_table.add_global_secondary_index(
            index_name="JoinCodeIndex",
            partition_key=dynamodb.Attribute(
                name="joinCode", type=dynamodb.AttributeType.STRING
            ),
        )

        # Lambda Layer for shared dependencies
        dependencies_layer = _lambda.LayerVersion(
            self,
            "CheckpointDependencies",
            code=_lambda.Code.from_asset("../lambda"),
            compatible_runtimes=[_lambda.Runtime.PYTHON_3_9],
            description="Checkpoint shared dependencies",
        )

        # Common Lambda environment
        lambda_environment = {
            "GAMES_TABLE": games_table.table_name,
            "IMAGES_BUCKET": images_bucket.bucket_name,
        }

        # Lambda function for game resolvers
        game_resolvers = _lambda.Function(
            self,
            "GameResolvers",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="game_resolvers.create_game_resolver",  # Will be overridden per resolver
            code=_lambda.Code.from_asset("../lambda"),
            layers=[dependencies_layer],
            environment=lambda_environment,
            timeout=Duration.seconds(30),
            memory_size=512,
        )

        # Lambda function for image processing
        image_processor = _lambda.Function(
            self,
            "ImageProcessor",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="image_processor.upload_board_image_resolver",
            code=_lambda.Code.from_asset("../lambda"),
            layers=[dependencies_layer],
            environment=lambda_environment,
            timeout=Duration.seconds(60),
            memory_size=1024,
        )

        # Lambda function triggered by S3 uploads
        cv_processor = _lambda.Function(
            self,
            "CVProcessor",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="image_processor.trigger_physical_move_detection",
            code=_lambda.Code.from_asset("../lambda"),
            layers=[dependencies_layer],
            environment=lambda_environment,
            timeout=Duration.minutes(5),
            memory_size=2048,
        )

        # Lambda function for push notifications
        push_notifications = _lambda.Function(
            self,
            "PushNotifications",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="push_notifications.lambda_handler",
            code=_lambda.Code.from_asset("../lambda"),
            layers=[dependencies_layer],
            environment=lambda_environment,
            timeout=Duration.seconds(30),
            memory_size=256,
        )

        # Update environment variables with push notification function name
        game_resolvers.add_environment(
            "PUSH_NOTIFICATION_FUNCTION", push_notifications.function_name
        )
        image_processor.add_environment(
            "PUSH_NOTIFICATION_FUNCTION", push_notifications.function_name
        )
        cv_processor.add_environment(
            "PUSH_NOTIFICATION_FUNCTION", push_notifications.function_name
        )

        # Grant DynamoDB permissions
        games_table.grant_read_write_data(game_resolvers)
        games_table.grant_read_write_data(image_processor)
        games_table.grant_read_write_data(cv_processor)

        # Grant S3 permissions
        images_bucket.grant_read_write(image_processor)
        images_bucket.grant_read(cv_processor)

        # Grant Lambda invoke permissions
        push_notifications.grant_invoke(game_resolvers)
        push_notifications.grant_invoke(image_processor)
        push_notifications.grant_invoke(cv_processor)

        # S3 notification to trigger CV processing
        images_bucket.add_event_notification(
            s3.EventType.OBJECT_CREATED,
            s3n.LambdaDestination(cv_processor),
            s3.NotificationKeyFilter(prefix="games/", suffix=".jpg"),
        )

        # AppSync API
        api = appsync.GraphqlApi(
            self,
            "CheckpointApi",
            name="checkpoint-api",
            definition=appsync.Definition.from_file("../graphql/schema.graphql"),
            authorization_config=appsync.AuthorizationConfig(
                default_authorization=appsync.AuthorizationMode(
                    authorization_type=appsync.AuthorizationType.API_KEY,
                    api_key_config=appsync.ApiKeyConfig(
                        expires=Expiration.after(Duration.days(365))
                    ),
                )
            ),
            log_config=appsync.LogConfig(
                field_log_level=appsync.FieldLogLevel.ALL,
                retention=logs.RetentionDays.ONE_WEEK,
            ),
            xray_enabled=True,
        )

        # Grant AppSync permissions to invoke Lambda
        api.grant_mutation(
            game_resolvers,
            "createGame",
            "joinGame",
            "makeDigitalMove",
            "recordPhysicalMove",
            "updatePlayerConnection",
            "completeCalibration",
            "registerPushToken",
        )
        api.grant_query(game_resolvers, "getGame", "getGameByJoinCode")
        api.grant_mutation(image_processor, "uploadBoardImage")

        # Lambda Data Sources
        create_game_ds = api.add_lambda_data_source(
            "CreateGameDataSource", game_resolvers
        )

        join_game_ds = api.add_lambda_data_source("JoinGameDataSource", game_resolvers)

        make_digital_move_ds = api.add_lambda_data_source(
            "MakeDigitalMoveDataSource", game_resolvers
        )

        record_physical_move_ds = api.add_lambda_data_source(
            "RecordPhysicalMoveDataSource", game_resolvers
        )

        update_player_connection_ds = api.add_lambda_data_source(
            "UpdatePlayerConnectionDataSource", game_resolvers
        )

        complete_calibration_ds = api.add_lambda_data_source(
            "CompleteCalibrationDataSource", game_resolvers
        )

        register_push_token_ds = api.add_lambda_data_source(
            "RegisterPushTokenDataSource", game_resolvers
        )

        upload_image_ds = api.add_lambda_data_source(
            "UploadImageDataSource", image_processor
        )

        # DynamoDB Direct Data Sources for queries
        games_dynamo_ds = api.add_dynamo_db_data_source(
            "GamesDynamoDataSource", games_table
        )

        # Resolvers
        create_game_ds.create_resolver(
            "CreateGameResolver",
            type_name="Mutation",
            field_name="createGame",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        join_game_ds.create_resolver(
            "JoinGameResolver",
            type_name="Mutation",
            field_name="joinGame",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        make_digital_move_ds.create_resolver(
            "MakeDigitalMoveResolver",
            type_name="Mutation",
            field_name="makeDigitalMove",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        record_physical_move_ds.create_resolver(
            "RecordPhysicalMoveResolver",
            type_name="Mutation",
            field_name="recordPhysicalMove",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        update_player_connection_ds.create_resolver(
            "UpdatePlayerConnectionResolver",
            type_name="Mutation",
            field_name="updatePlayerConnection",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        complete_calibration_ds.create_resolver(
            "CompleteCalibrationResolver",
            type_name="Mutation",
            field_name="completeCalibration",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        register_push_token_ds.create_resolver(
            "RegisterPushTokenResolver",
            type_name="Mutation",
            field_name="registerPushToken",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        upload_image_ds.create_resolver(
            "UploadImageResolver",
            type_name="Mutation",
            field_name="uploadBoardImage",
            request_mapping_template=appsync.MappingTemplate.lambda_request(),
            response_mapping_template=appsync.MappingTemplate.lambda_result(),
        )

        # Direct DynamoDB resolvers for queries
        games_dynamo_ds.create_resolver(
            "GetGameResolver",
            type_name="Query",
            field_name="getGame",
            request_mapping_template=appsync.MappingTemplate.dynamo_db_get_item(
                "id", "id"
            ),
            response_mapping_template=appsync.MappingTemplate.dynamo_db_result_item(),
        )

        # Grant AppSync permission to execute Lambda - done through data sources

        # Update CV processor environment with AppSync endpoint
        cv_processor.add_environment("APPSYNC_ENDPOINT", api.graphql_url)

        # Grant CV processor permission to call AppSync
        cv_processor.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "appsync:GraphQL",
                    "appsync:GetGraphqlApi",
                    "appsync:ListGraphqlApis",
                ],
                resources=[api.arn],
            )
        )

        # S3 Bucket for hosting web clients
        web_hosting_bucket = s3.Bucket(
            self,
            "CheckpointWebHosting",
            bucket_name=f"checkpoint-web-{self.account}-{self.region}",
            website_index_document="index.html",
            website_error_document="index.html",
            public_read_access=True,
            block_public_access=s3.BlockPublicAccess(
                block_public_acls=False,
                ignore_public_acls=False,
                block_public_policy=False,
                restrict_public_buckets=False,
            ),
        )

        # CloudFront distribution for web clients
        distribution = cloudfront.Distribution(
            self,
            "CheckpointDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(web_hosting_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_ALL,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            default_root_object="index.html",
        )

        # Outputs
        CfnOutput(
            self,
            "GraphQLAPIURL",
            value=api.graphql_url,
            description="AppSync GraphQL API URL",
        )

        CfnOutput(
            self,
            "GraphQLAPIKey",
            value=api.api_key or "No API Key",
            description="AppSync API Key",
        )

        CfnOutput(
            self,
            "WebsiteURL",
            value=f"https://{distribution.domain_name}",
            description="CloudFront distribution URL",
        )

        CfnOutput(
            self,
            "ImagesBucket",
            value=images_bucket.bucket_name,
            description="S3 bucket for board images",
        )

        CfnOutput(
            self,
            "WebHostingBucket",
            value=web_hosting_bucket.bucket_name,
            description="S3 bucket for web hosting",
        )
