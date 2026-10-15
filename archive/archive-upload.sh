#!/bin/bash
export PATH=/usr/bin:/bin:/usr/sbin:$PATH
cd "$HOME/Code/sharechef-ai/ios/App"
OUT=/tmp/sc-archive; rm -rf $OUT; mkdir -p $OUT
cat > $OUT/export.plist <<'P'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>teamID</key><string>LAW8C4M6Y6</string>
<key>uploadSymbols</key><true/>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
P
xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath $OUT/App.xcarchive archive -allowProvisioningUpdates -quiet > $OUT/archive.log 2>&1
echo ARCHIVE:$? >> $OUT/archive.log
xcodebuild -exportArchive -archivePath $OUT/App.xcarchive -exportOptionsPlist $OUT/export.plist -exportPath $OUT/export -allowProvisioningUpdates > $OUT/upload.log 2>&1
echo UPLOAD:$? >> $OUT/upload.log
echo DONE >> $OUT/upload.log
