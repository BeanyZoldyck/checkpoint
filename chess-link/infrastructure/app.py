#!/usr/bin/env python3
import aws_cdk as cdk
from chess_link_stack import CheckpointStack

app = cdk.App()
CheckpointStack(app, "CheckpointStack")

app.synth()
