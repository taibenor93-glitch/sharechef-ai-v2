#!/bin/bash
export PATH=/usr/bin:/bin:/usr/sbin:/opt/homebrew/bin:$PATH
SIM=D4A3584F-6E6C-49D9-9D96-BF2234013177
cd "$HOME/Code/sharechef-ai/ios/App"
xcodebuild -project App.xcodeproj -scheme App -destination "id=$SIM" -configuration Debug build CODE_SIGNING_ALLOWED=NO -quiet -derivedDataPath /tmp/sc-dd > /tmp/sc-sim2.log 2>&1
echo BUILD:$? >> /tmp/sc-sim2.log
xcrun simctl boot $SIM >> /tmp/sc-sim2.log 2>&1
sleep 20
xcrun simctl install $SIM /tmp/sc-dd/Build/Products/Debug-iphonesimulator/App.app >> /tmp/sc-sim2.log 2>&1
echo INSTALL:$? >> /tmp/sc-sim2.log
xcrun simctl launch $SIM com.sharechef.app >> /tmp/sc-sim2.log 2>&1
echo LAUNCH:$? >> /tmp/sc-sim2.log
sleep 15
echo PS: >> /tmp/sc-sim2.log
pgrep -fl "App.app/App" >> /tmp/sc-sim2.log
xcrun simctl io $SIM screenshot /tmp/sc-sim.png >> /tmp/sc-sim2.log 2>&1
echo DONE >> /tmp/sc-sim2.log
