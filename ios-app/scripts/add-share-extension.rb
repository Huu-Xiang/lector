# Adds the ShareExtension target to the generated Xcode project and embeds it in the app.
# Run once after `npx cap add ios`; it does nothing when the target already exists.
# Usage: GEM_HOME=<cocoapods libexec> ruby scripts/add-share-extension.rb
require 'xcodeproj'

path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(path)
exit 0 if project.targets.any? { |t| t.name == 'ShareExtension' }

app = project.targets.find { |t| t.name == 'App' }
ext = project.new_target(:app_extension, 'ShareExtension', :ios, '14.0')

group = project.main_group.new_group('ShareExtension', 'ShareExtension')
source = group.new_file('ShareViewController.swift')
group.new_file('Info.plist')
ext.add_file_references([source])

app_bundle_id = app.build_configurations.first.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
ext.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_bundle_id}.ShareExtension"
  s['INFOPLIST_FILE'] = 'ShareExtension/Info.plist'
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SKIP_INSTALL'] = 'YES'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['MARKETING_VERSION'] = app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION'] || '1'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['CODE_SIGN_STYLE'] = 'Automatic'
end

app.add_dependency(ext)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13'
build_file = embed.add_file_reference(ext.product_reference)
build_file.settings = { 'ATTRIBUTES' => %w[RemoveHeadersOnCopy CodeSignOnCopy] }

project.save
puts 'ShareExtension target added'
