# Checkpoint Mobile App

React Native/Expo mobile app for playing chess with push notifications and AWS AppSync integration.

## Features

- 📱 **Native Mobile Experience**: React Native app with camera access and notifications
- 🔔 **Push Notifications**: Real-time notifications when opponent makes moves
- ☁️ **AWS AppSync Integration**: Real-time chess gameplay via GraphQL subscriptions
- 📷 **Computer Vision Ready**: Extensible framework for board move detection
- 🎯 **Auto Game Management**: Automatically creates games and handles connections

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Deploy AWS Backend**:
   ```bash
   cd ../chess-link
   ./deploy.sh
   ```
   This automatically configures the mobile app with AWS endpoints.

3. **Start Development Server**:
   ```bash
   npm start
   ```

4. **Test on Device**:
   - Install **Expo Go** app on your phone
   - Scan the QR code displayed in terminal
   - Grant camera and notification permissions

## Architecture

```
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App        │    │   AWS AppSync    │    │   Web App       │
│   (React Native)    │◄──►│   (GraphQL)      │◄──►│   (Vanilla JS)  │
│                     │    │                  │    │                 │
│ • Camera capture    │    │ • Real-time      │    │ • Digital board │
│ • Push notifications│    │   subscriptions  │    │ • Move input    │
│ • Move detection    │    │ • Game state     │    │ • Game display  │
└─────────────────────┘    └──────────────────┘    └─────────────────┘
           │                         │
           │                         ▼
           │               ┌──────────────────┐
           │               │   Lambda         │
           │               │   Functions      │
           │               │                  │
           └──────────────►│ • Game logic     │
                           │ • Move validation│
                           │ • Push notifications│
                           │ • Computer vision│
                           └──────────────────┘
```

## Key Files

- **`services/api.ts`**: AWS AppSync integration and game management
- **`services/notifications.ts`**: Expo push notification service  
- **`services/config.ts`**: AWS configuration (auto-generated)
- **`app/(tabs)/index.tsx`**: Main camera/game screen
- **`app.json`**: Expo configuration with notification permissions

## Push Notifications

The app supports three types of notifications:

1. **Move Notifications**: When opponent makes a move
2. **Game Start**: When a new game begins
3. **Game End**: When game concludes (win/loss/draw)

Notifications work both when app is:
- **Foreground**: Shows in-app move indicators
- **Background**: Push notification with sound/vibration

## Development vs Production

- **Stub Mode**: When AWS is not configured, uses mock data
- **Production Mode**: Connects to real AWS AppSync backend
- **Configuration**: Automatically set by deployment script

## Testing Push Notifications

1. Deploy AWS backend with `./deploy.sh`
2. Start mobile app on physical device (required for notifications)
3. Open web app in browser
4. Make moves in web app to trigger mobile notifications
5. Check notification delivery and app behavior

## File Structure

```
checkpoint/
├── app/                     # Expo Router screens
│   ├── (tabs)/
│   │   └── index.tsx       # Main camera screen
│   └── _layout.tsx         # Root layout
├── services/               # Core services
│   ├── api.ts             # AWS AppSync integration
│   ├── notifications.ts   # Push notification service
│   └── config.ts          # AWS configuration
├── components/            # Reusable components
├── assets/               # Images, fonts, sounds
└── package.json          # Dependencies and scripts
```

## Dependencies

- **expo**: React Native framework
- **expo-notifications**: Push notification support
- **expo-camera**: Camera access for board capture
- **aws-amplify**: AWS AppSync GraphQL client
- **react-native**: Core React Native framework

## Troubleshooting

### Notifications Not Working
- Ensure you're using a physical device (simulator won't work)
- Grant notification permissions when prompted
- Check AWS Lambda logs for push notification errors

### AppSync Connection Issues
- Verify AWS backend is deployed successfully
- Check `services/config.ts` has correct endpoints
- Ensure AWS credentials are configured

### Camera Not Working
- Grant camera permissions when prompted
- Ensure device has rear-facing camera
- Check for proper camera usage description in app.json

## Next Steps

1. **Enhanced Computer Vision**: Replace mock CV with real model
2. **User Management**: Add proper authentication and user accounts
3. **Game History**: Store and display past games
4. **Multiplayer Rooms**: Support multiple concurrent games
5. **Tournament Mode**: Add tournament bracket support
