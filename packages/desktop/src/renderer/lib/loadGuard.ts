/**
 * @file src/renderer/lib/loadGuard.ts
 * @description 载入响应的次序护栏。
 *   同一份数据的并发拉取，出发顺序不等于返回顺序，
 *   每次载入领一张递增票据，响应落地前对票，过期响应整段丢弃，
 *   保证 store 里只留下最新一次请求的结果。
 */

/** 载入次序护栏，一个实例保护一条 load 路径，票据留在实例内 */
export class LoadGuard {
  /** 最近一次已发出的票据 */
  private latest = 0;

  /** 开始一次载入，返回本次票据 */
  begin(): number {
    this.latest += 1;
    return this.latest;
  }

  /** 票据是否仍是最新一次载入，过期响应不应落地 */
  isCurrent(ticket: number): boolean {
    return ticket === this.latest;
  }
}
