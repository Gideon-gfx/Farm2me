import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api/client";

// Refetches the unread count every time the screen holding the bell icon
// regains focus — covers both "a new notification arrived" (poll-driven
// screens like FindDriverScreen already refresh this often) and "the user
// just came back from Notifications, where opening it marks everything
// read" (see NotificationsScreen's read-all-on-open).
export function useUnreadNotifications(): number {
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .get<{ unreadCount: number }>("/notifications", { params: { limit: 1 } })
        .then(({ data }) => {
          if (!cancelled) setUnreadCount(data.unreadCount ?? 0);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return unreadCount;
}
