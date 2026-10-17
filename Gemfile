# fastlane drives the iOS build/sign/upload pipeline (fastlane/Fastfile,
# .github/workflows/ios.yml). Ruby is not otherwise used in this repo -- it
# only exists on the macOS CI runner and on a Mac used for local iOS work.
source "https://rubygems.org"

gem "fastlane", "~> 2.239"

# fastlane plugins, if any are added, live in fastlane/Pluginfile and are
# pulled in here:
plugins_path = File.join(File.dirname(__FILE__), "fastlane", "Pluginfile")
eval_gemfile(plugins_path) if File.exist?(plugins_path)
