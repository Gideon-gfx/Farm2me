import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { captureLocation } from "../../lib/location";
import { COLORS, FONT, RADIUS, SPACING } from "../../constants/theme";
import { Icon, type IconName } from "../../components/Icon";
import { showToast } from "../../components/Toast";
import type { RootStackParamList } from "../../navigation/types";

function Row({ icon, label, value, action }: { icon: "phone" | "escrow" | "profile"; label: string; value: string; action?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={COLORS.TEXT_MUTED} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {action}
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={COLORS.TEXT_MUTED} />
      </View>
      <Text style={styles.menuRowLabel}>{label}</Text>
      <Text style={styles.menuRowChevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshProfile, signOut } = useAuth();
  const [locating, setLocating] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  if (!user) return null;

  async function updateLocation() {
    setLocating(true);
    await captureLocation();
    await refreshProfile();
    setLocating(false);
  }

  async function pickAndUploadPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast("Photo permission is required to update your photo.", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("photo", {
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as any);
      await api.post("/auth/photo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshProfile();
    } catch {
      // Best-effort — no toast infra on this screen; the button just stops spinning.
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatar} onPress={pickAndUploadPhoto} disabled={uploadingPhoto} activeOpacity={0.85}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{user.fullName.slice(0, 1).toUpperCase()}</Text>
          )}
          <View style={styles.cameraBadge}>
            <Icon name="camera" size={13} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.role}>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</Text>
        <TouchableOpacity onPress={pickAndUploadPhoto} disabled={uploadingPhoto}>
          <Text style={styles.photoLink}>{uploadingPhoto ? "Uploading…" : user.avatarUrl ? "Change photo" : "Add a photo"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Row icon="profile" label="Email" value={user.email ?? "Not set"} />
        <View style={styles.divider} />
        <Row icon="phone" label="Phone number" value={user.phoneNumber ?? "Not linked"} />
        <View style={styles.divider} />
        <Row
          icon="escrow"
          label="Location"
          value={user.locationLabel ?? "Not set"}
          action={
            <TouchableOpacity onPress={updateLocation} disabled={locating}>
              <Text style={styles.updateLink}>{locating ? "Locating…" : "Update"}</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={[styles.card, { marginTop: SPACING.md }]}>
        <MenuRow icon="wallet" label="Wallet" onPress={() => navigation.navigate("Wallet")} />
        <View style={styles.divider} />
        <MenuRow icon="star" label="Plans & Subscription" onPress={() => navigation.navigate("Subscription")} />
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BACKGROUND, padding: SPACING.lg },
  header: { alignItems: "center", marginTop: SPACING.md, marginBottom: SPACING.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 24, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.WHITE },
  cameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.PRIMARY_DARK,
    borderWidth: 2,
    borderColor: COLORS.BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { marginTop: SPACING.sm, fontSize: 18, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_PRIMARY },
  role: { fontSize: FONT.size.small, fontFamily: FONT.family, color: COLORS.TEXT_MUTED, marginTop: 2 },
  photoLink: { marginTop: 6, fontSize: 12, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  card: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md },
  rowIcon: { width: 32, alignItems: "center" },
  rowLabel: { fontSize: 11, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.TEXT_MUTED },
  rowValue: { fontSize: FONT.size.base, fontFamily: FONT.familySemibold, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.DIVIDER },
  menuRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md },
  menuRowLabel: { flex: 1, fontSize: FONT.size.base, fontFamily: FONT.familySemibold, fontWeight: FONT.weight.semibold, color: COLORS.TEXT_PRIMARY },
  menuRowChevron: { fontSize: 18, color: COLORS.TEXT_MUTED },
  updateLink: { fontSize: 12.5, fontWeight: FONT.weight.bold, fontFamily: FONT.familyBold, color: COLORS.PRIMARY },
  signOut: { marginTop: SPACING.lg, alignItems: "center", padding: SPACING.sm },
  signOutText: { fontSize: FONT.size.base, fontFamily: FONT.familySemibold, fontWeight: FONT.weight.semibold, color: COLORS.DANGER },
});
