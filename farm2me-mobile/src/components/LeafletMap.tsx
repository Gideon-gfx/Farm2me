// Android stand-in for react-native-maps: Google Maps SDK on Android needs
// a real, billed API key even inside Expo Go (Apple Maps on iOS needs none),
// so Android instead gets a WebView running Leaflet.js over free OpenStreetMap
// tiles — no key, no billing account, works the moment the device has internet.
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export interface LeafletMarker {
  id: string;
  lat: number;
  lng: number;
  emoji?: string;
  // Shown in a Leaflet popup on tap — matches react-native-maps' Marker
  // title/description callout on iOS.
  popupTitle?: string;
  popupSubtitle?: string;
  // Always-visible small label under the pin (e.g. "2.4km") — unlike the
  // popup, shown without tapping.
  label?: string;
  // Highlighted ring behind the pin — tapped-for-comparison state.
  selected?: boolean;
}

export interface LeafletMapHandle {
  animateToRegion: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
  initialRegion: { latitude: number; longitude: number };
  markers: LeafletMarker[];
  onMarkerPress?: (id: string) => void;
  // A line drawn between two arbitrary points (e.g. two selected drivers) —
  // separate from any marker, since it isn't anchored to a single pin.
  polyline?: [{ lat: number; lng: number }, { lat: number; lng: number }];
}

function escapeForJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildHtml(
  center: { latitude: number; longitude: number },
  markers: LeafletMarker[],
  polyline?: [{ lat: number; lng: number }, { lat: number; lng: number }]
): string {
  const markerJs = markers
    .map((m) => {
      const popupLines = [m.popupTitle, m.popupSubtitle]
        .filter((v): v is string => Boolean(v))
        .map(escapeForJs);
      const popupJs = popupLines.length
        ? `.bindPopup('<b>${popupLines[0] ?? ""}</b>${popupLines[1] ? "<br/>" + popupLines[1] : ""}')`
        : "";
      const labelHtml = m.label
        ? `<div style="background:#fff;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;color:#24352A;margin-top:2px;box-shadow:0 1px 2px rgba(0,0,0,0.3);white-space:nowrap;">${escapeForJs(m.label)}</div>`
        : "";
      const ringHtml = m.selected
        ? '<div style="position:absolute;top:-4px;left:11px;width:52px;height:52px;border-radius:26px;border:3px solid #2F6B3F;box-sizing:border-box;"></div>'
        : "";
      return `
    L.marker([${m.lat}, ${m.lng}], {
      icon: L.divIcon({
        className: 'pin',
        html: '<div style="position:relative;display:flex;flex-direction:column;align-items:center;">${ringHtml}<div style="font-size:44px;line-height:44px;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">${escapeForJs(m.emoji ?? "📍")}</div>${labelHtml}</div>',
        iconSize: [70, 66],
        iconAnchor: [35, 22],
        popupAnchor: [0, -22],
      })
    })${popupJs}.addTo(map).on('click', function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', id: '${escapeForJs(m.id)}' }));
    });`;
    })
    .join("\n");

  const polylineJs = polyline
    ? `L.polyline([[${polyline[0].lat}, ${polyline[0].lng}], [${polyline[1].lat}, ${polyline[1].lng}]], { color: '#2F6B3F', weight: 3, dashArray: '6 6' }).addTo(map);`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false })
      .setView([${center.latitude}, ${center.longitude}], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    ${polylineJs}
    ${markerJs}
    function focusMarker(lat, lng, zoom) {
      map.flyTo([lat, lng], zoom || 14);
    }
  </script>
</body>
</html>`;
}

const LeafletMap = forwardRef<LeafletMapHandle, Props>(({ initialRegion, markers, onMarkerPress, polyline }, ref) => {
  const webviewRef = useRef<WebView>(null);
  const html = useMemo(
    () => buildHtml(initialRegion, markers, polyline),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialRegion.latitude, initialRegion.longitude, JSON.stringify(markers), JSON.stringify(polyline)]
  );

  useImperativeHandle(ref, () => ({
    animateToRegion: (lat, lng, zoom) => {
      webviewRef.current?.injectJavaScript(`focusMarker(${lat}, ${lng}, ${zoom ?? 14}); true;`);
    },
  }));

  return (
    <WebView
      ref={webviewRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={["*"]}
      source={{ html }}
      onMessage={(event) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data);
          if (msg.type === "markerPress" && onMarkerPress) onMarkerPress(msg.id);
        } catch {
          // Ignore malformed bridge messages.
        }
      }}
    />
  );
});

export default LeafletMap;
