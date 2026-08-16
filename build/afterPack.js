'use strict';

const { FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  await context.packager.addElectronFuses(context, {
    version: FuseVersion.V1,

    strictlyRequireAllFuses: false,

    [FuseV1Options.RunAsNode]: false,

    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,

    [FuseV1Options.OnlyLoadAppFromAsar]: true,

    [FuseV1Options.EnableNodeCliInspectArguments]: false,

    [FuseV1Options.EnableCookieEncryption]: true,
  });
};
