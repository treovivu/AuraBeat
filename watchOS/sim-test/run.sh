#!/bin/sh
# Runs the watch logic on a Mac (no Xcode needed): WatchKit/CoreMotion are replaced by Stubs.swift.
set -e
cd "$(dirname "$0")"
BUILD=$(mktemp -d)
for f in HapticManager MotionDetector WatchWebSocketClient; do
  sed -e 's/^import WatchKit$/import Combine/' -e 's/^import CoreMotion$/import Combine/' "../$f.swift" > "$BUILD/$f.swift"
done
swiftc -O -o "$BUILD/sim-tests" Stubs.swift "$BUILD"/*.swift main.swift
PORT=8799
node test-server.mjs $PORT & SERVER=$!
sleep 0.5
"$BUILD/sim-tests" $PORT || true
kill $SERVER 2>/dev/null || true
