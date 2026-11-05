# Adds the app's own Swift plugins to the App target and the ReviewWidget extension target.
# Run once after `npx cap add ios`; each step does nothing when it is already done.
# Usage: GEM_HOME=<cocoapods libexec> ruby scripts/add-native-ui.rb
require 'xcodeproj'

path = File.expand_path('../ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(path)
app = project.targets.find { |t| t.name == 'App' }
app_group = project.main_group.children.find { |g| g.display_name == 'App' }

APP_SOURCES = %w[MainViewController.swift NativeTabBarPlugin.swift ReviewWidgetPlugin.swift ReviewWidgetShared.swift].freeze

def file_ref(group, name)
  group.files.find { |f| f.path == name } || group.new_file(name)
end

APP_SOURCES.each do |name|
  ref = file_ref(app_group, name)
  app.add_file_references([ref]) unless app.source_build_phase.files_references.include?(ref)
end
file_ref(app_group, 'App.entitlements')
app.build_configurations.each { |c| c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements' }

%w[zh-Hans zh-Hant ja ko].each { |r| project.root_object.known_regions << r unless project.root_object.known_regions.include?(r) }

unless project.targets.any? { |t| t.name == 'ReviewWidget' }
  ext = project.new_target(:app_extension, 'ReviewWidget', :ios, '17.0')
  group = project.main_group.new_group('ReviewWidget', 'ReviewWidget')
  ext.add_file_references([group.new_file('ReviewWidget.swift')])
  ext.add_file_references([file_ref(app_group, 'ReviewWidgetShared.swift')])
  group.new_file('Info.plist')
  group.new_file('ReviewWidget.entitlements')
  ext.add_resources([group.new_file('Assets.xcassets')])

  strings = group.new_variant_group('Localizable.strings')
  %w[en zh-Hans zh-Hant ja ko].each do |lang|
    ref = strings.new_file("#{lang}.lproj/Localizable.strings")
    ref.name = lang
  end
  ext.add_resources([strings])

  app_settings = app.build_configurations.first.build_settings
  ext.build_configurations.each do |config|
    s = config.build_settings
    s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{app_settings['PRODUCT_BUNDLE_IDENTIFIER']}.ReviewWidget"
    s['INFOPLIST_FILE'] = 'ReviewWidget/Info.plist'
    s['CODE_SIGN_ENTITLEMENTS'] = 'ReviewWidget/ReviewWidget.entitlements'
    s['SWIFT_VERSION'] = '5.0'
    s['TARGETED_DEVICE_FAMILY'] = '1,2'
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['SKIP_INSTALL'] = 'YES'
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = ''
    s['MARKETING_VERSION'] = app_settings['MARKETING_VERSION'] || '1.0'
    s['CURRENT_PROJECT_VERSION'] = app_settings['CURRENT_PROJECT_VERSION'] || '1'
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    s['CODE_SIGN_STYLE'] = 'Automatic'
  end

  app.add_dependency(ext)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } ||
          app.new_copy_files_build_phase('Embed Foundation Extensions').tap { |p| p.dst_subfolder_spec = '13' }
  build_file = embed.add_file_reference(ext.product_reference)
  build_file.settings = { 'ATTRIBUTES' => %w[RemoveHeadersOnCopy CodeSignOnCopy] }
end

project.save
puts 'Native UI files and the ReviewWidget target are in place'
