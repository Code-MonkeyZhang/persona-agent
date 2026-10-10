/**
 * @fileoverview 握手契约 — 客户端连接主机前的身份识别。
 */

/** GET /api/handshake 的响应，hostId 是主机身份，隧道地址变化不影响它 */
export interface HandshakeInfo {
  hostId: string;
  /** 服务端自称名默认值，取 OS hostname，客户端改名只存本地 */
  hostName: string;
  /** 服务端版本，供客户端做兼容性判断 */
  version: string;
}
