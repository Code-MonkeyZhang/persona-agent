import type { I18nKey } from '../../i18n';
import notionLogo from '../../assets/caps/notion.png';
import didaLogo from '../../assets/caps/dida.png';
import musicLogo from '../../assets/caps/music.png';
import weatherLogo from '../../assets/caps/weather.svg';
import githubLogo from '../../assets/caps/github.svg';
import gmailLogo from '../../assets/caps/gmail.svg';
import slackLogo from '../../assets/caps/slack.svg';
import pomodoroIcon from '../../assets/caps/pomodoro.png';
import rpsIcon from '../../assets/caps/rps.png';
import healthIcon from '../../assets/caps/health.png';
import skillDiaryLogo from '../../assets/caps/skill-diary.svg';
import skillWeatherLogo from '../../assets/caps/skill-weather.svg';
import skillNewsLogo from '../../assets/caps/skill-news.svg';
import skillTickTickLogo from '../../assets/caps/skill-ticktick.svg';

/**
 * Items of the two marquee lanes under the capability copy, real marketplace
 * entries plus showcase integrations, shown with their shipped logos.
 */

export type CapItem = { logo: string; nameKey: I18nKey };

/** MCP tools and agent apps share one lane because agent apps ride on MCP. */
export const CAP_MCPS: CapItem[] = [
  { logo: notionLogo, nameKey: 'cap.notN' },
  { logo: githubLogo, nameKey: 'cap.ghN' },
  { logo: didaLogo, nameKey: 'cap.diN' },
  { logo: gmailLogo, nameKey: 'cap.gmN' },
  { logo: musicLogo, nameKey: 'cap.muN' },
  { logo: slackLogo, nameKey: 'cap.skN' },
  { logo: weatherLogo, nameKey: 'cap.weN' },
  { logo: pomodoroIcon, nameKey: 'cap.a1n' },
  { logo: rpsIcon, nameKey: 'cap.a2n' },
  { logo: healthIcon, nameKey: 'cap.a3n' },
];

export const CAP_SKILLS: CapItem[] = [
  { logo: skillDiaryLogo, nameKey: 'cap.s1n' },
  { logo: skillWeatherLogo, nameKey: 'cap.s2n' },
  { logo: skillNewsLogo, nameKey: 'cap.s3n' },
  { logo: skillTickTickLogo, nameKey: 'cap.s4n' },
];
