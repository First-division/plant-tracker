const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withFirebaseFixes(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      // Add $RNFirebaseAsStaticFramework before the target block
      if (!podfile.includes("$RNFirebaseAsStaticFramework")) {
        podfile = podfile.replace(
          /prepare_react_native_project!/,
          "$RNFirebaseAsStaticFramework = true\n\nprepare_react_native_project!"
        );
      }

      // Add use_modular_headers! inside the target block
      if (!podfile.includes("use_modular_headers!")) {
        podfile = podfile.replace(
          /use_expo_modules!/,
          "use_expo_modules!\n  use_modular_headers!"
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
}

module.exports = withFirebaseFixes;
