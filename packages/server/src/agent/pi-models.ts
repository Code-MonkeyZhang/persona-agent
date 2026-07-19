/**
 * @fileoverview pi-ai 0.80 改成了实例化 API，本文件维护全局唯一的 `Models` 集合。
 *
 * pi-ai 0.80 把全局函数 `stream` / `getModel` / `getModels` / `completeSimple`
 * 全部下沉到 `Models` 接口的实例方法上。本项目只在 server 进程内共享一个实例，
 * 注册所有内置供应商；凭证仍由 `auth/store.ts` 自己管理，调用时通过
 * `options.apiKey` 显式传入，不走 pi-ai 的 `CredentialStore`。
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { Logger } from '../util/logger.js';

/**
 * 全局唯一的 pi-ai `Models` 集合，注册了所有内置供应商。
 *
 * 调用方应使用 `models.stream(...)` / `models.getModel(...)` / `models.getModels(...)`
 * / `models.completeSimple(...)`，不要再从 `@earendil-works/pi-ai/compat` 引入。
 */
export const models = builtinModels();

Logger.log('LLM', 'pi-ai Models collection initialized');
