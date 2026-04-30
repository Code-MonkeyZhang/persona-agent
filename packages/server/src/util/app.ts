import pkg from '../../package.json' with { type: 'json' };

declare global {
  var SERVER_VERSION: string | undefined;
}

export const APP_NAME: string = pkg.name;

export const APP_VERSION: string = globalThis.SERVER_VERSION ?? pkg.version;
