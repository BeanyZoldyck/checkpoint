// ============================================================================
// Checkpoint Push Notification Service
//
// Handles Expo push notifications for real-time game updates
// ============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface NotificationData {
  type: 'game_start' | 'game_end'; // Note: 'move' type removed - moves shown on camera overlay
  gameId: string;
  message: string;
}

class NotificationService {
  private expoPushToken: string | null = null;
  private initialized = false;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Check if device supports notifications
      if (!Device.isDevice) {
        console.log('Must use physical device for push notifications');
        return false;
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return false;
      }

      // Get the token that uniquely identifies this device
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'checkpoint-chess', // This should match your Expo project ID
      });
      
      this.expoPushToken = token.data;
      console.log('Expo Push Token:', this.expoPushToken);

      // Configure notification channels for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('game-updates', {
          name: 'Game Updates',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  }

  getExpoPushToken(): string | null {
    return this.expoPushToken;
  }

  async registerForGameNotifications(gameId: string, playerId: string): Promise<boolean> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) return false;
    }

    if (!this.expoPushToken) return false;

    try {
      // Here you would typically send the push token to your backend
      // so it can send notifications when the opponent makes a move
      console.log(`Registering push token for game ${gameId}, player ${playerId}`);
      console.log('Push token:', this.expoPushToken);

      // In a real implementation, you would call your API to register this token
      // await api.registerPushToken(gameId, playerId, this.expoPushToken);

      return true;
    } catch (error) {
      console.error('Error registering for notifications:', error);
      return false;
    }
  }

  async unregisterFromGameNotifications(gameId: string, playerId: string): Promise<void> {
    try {
      console.log(`Unregistering from notifications for game ${gameId}, player ${playerId}`);
      // In a real implementation, you would call your API to unregister this token
      // await api.unregisterPushToken(gameId, playerId, this.expoPushToken);
    } catch (error) {
      console.error('Error unregistering from notifications:', error);
    }
  }

  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ) {
    // Listener for notifications received while app is running
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // Listener for when user taps on a notification
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      onNotificationResponse?.(response);
    });

    // Return cleanup function
    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }

  async showLocalNotification(title: string, body: string, data?: NotificationData) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: true,
          priority: Notifications.AndroidImportance.HIGH,
          categoryIdentifier: 'game-updates',
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error('Error showing local notification:', error);
    }
  }

  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('All notifications cancelled');
    } catch (error) {
      console.error('Error cancelling notifications:', error);
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Convenience functions
export const initializeNotifications = () => notificationService.initialize();
export const registerForGameNotifications = (gameId: string, playerId: string) => 
  notificationService.registerForGameNotifications(gameId, playerId);
export const unregisterFromGameNotifications = (gameId: string, playerId: string) => 
  notificationService.unregisterFromGameNotifications(gameId, playerId);
export const setupNotificationListeners = notificationService.setupNotificationListeners.bind(notificationService);
export const showLocalNotification = notificationService.showLocalNotification.bind(notificationService);
export const getExpoPushToken = () => notificationService.getExpoPushToken();