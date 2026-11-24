/**
 * @file 气泡的包内资源索引，情绪气泡与思考气泡都在这里
 * 情绪气泡的键集与 shared 的 BUBBLE_NAMES 一致，思考气泡单独一个键，Record 的类型与一致性测试双重锁定
 */
import type { LayerBubbleName } from '@persona/shared';
import angry from './angry.webp';
import angry2 from './angry2.webp';
import chat from './chat.webp';
import doubt from './doubt.webp';
import embarrassed from './embarrassed.webp';
import fluster from './fluster.webp';
import flutter from './flutter.webp';
import happy from './happy.webp';
import nervous from './nervous.webp';
import notice from './notice.webp';
import shy from './shy.webp';
import sigh from './sigh.webp';
import surprise from './surprise.webp';
import sweat from './sweat.webp';
import tears from './tears.webp';
import thinking from './thinking.webp';

export const EFFECT_URLS: Record<LayerBubbleName, string> = {
  happy,
  flutter,
  tears,
  angry,
  doubt,
  sweat,
  sigh,
  shy,
  surprise,
  fluster,
  nervous,
  embarrassed,
  notice,
  chat,
  angry2,
  thinking,
};
