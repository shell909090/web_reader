export type ProfileName = 'default' | 'chrome-win' | 'firefox' | 'mobile' | 'curl';

export type Profile = {
  ua: string;
  /** Additional headers to override (e.g. Accept for curl). */
  headers?: Record<string, string>;
};

export const PROFILES: Record<ProfileName, Profile> = {
  default: {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  'chrome-win': {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  firefox: {
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  },
  mobile: {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  curl: {
    ua: 'curl/8.7.1',
    headers: { Accept: '*/*' },
  },
};

export const PROFILE_NAMES = Object.keys(PROFILES) as ProfileName[];

let _activeProfile: ProfileName = 'default';

/** Switch the global HTTP request profile used by httpGet. */
export function setActiveProfile(name: ProfileName): void {
  _activeProfile = name;
}

/** Return the currently active profile name. */
export function getActiveProfile(): ProfileName {
  return _activeProfile;
}
