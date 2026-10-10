/**
 * @file 设备管理页，设备清单浮层的管理入口进来。
 * 上半是设备条目，名字与地址旁的铅笔就地编辑，垃圾桶在行尾删除。
 * 下方新建连接按握手 hostId 认主机，连过的机器更新地址，没连过的建立新条目。
 * 连接过程按地址可达、握手识别、条目落位、切换同步推进，失败保留输入内容。
 */
import { useState } from 'react';
import { Plus, Loader2, X, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusDot } from '../ui/StatusDot';
import { toast } from '../../stores/toastStore';
import {
  useConnectionStore,
  deviceDisplayName,
  deviceStatus,
  type ConnectError,
} from '../../stores/connectionStore';
import { deviceStatusDot } from './DeviceListPopover';
import { LOCAL_DEVICE_ID } from '@shared/api';

interface DeviceManageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 新建连接失败原因到提示文案的映射 */
const CONNECT_ERROR_KEYS: Record<ConnectError, string> = {
  unreachable: 'device.toast.unreachable',
  handshake_failed: 'device.toast.handshakeFailed',
  version_incompatible: 'device.toast.versionIncompatible',
  identity_mismatch: 'device.toast.identityMismatch',
  switch_failed: 'device.toast.switchFailed',
};

export function DeviceManageModal({ isOpen, onClose }: DeviceManageModalProps) {
  const { t } = useTranslation();
  const connectStage = useConnectionStore((s) => s.connectStage);
  const connectError = useConnectionStore((s) => s.connectError);
  const connectByAddress = useConnectionStore((s) => s.connectByAddress);

  /** 输入内容只在成功后清空，失败保留方便改正 */
  const [address, setAddress] = useState('');

  if (!isOpen) return null;

  const pending = connectStage !== 'idle';

  const handleConnect = () => {
    if (!address.trim() || pending) return;
    void connectByAddress(address).then((ok) => {
      if (ok) setAddress('');
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground">
                {t('server.deviceManageTitle')}
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-secondary rounded text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-y-auto px-6 pb-6 space-y-6">
            {/* 设备条目：地址就在行内可看可改，不用进二级层 */}
            <DeviceSection />

            {/* 新建连接：握手 hostId 认主机，旧设备更新地址，新设备建立条目 */}
            <section>
              <div className="text-xs text-muted-foreground mb-2">
                {t('device.newConnect')}
              </div>
              <div className="rounded-[16px] border border-border bg-white p-4">
                <div className="flex gap-2">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder={t('device.addressPlaceholder')}
                    className="flex-1 min-w-0 text-sm rounded-lg border border-border bg-white px-3 py-2 outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    onClick={handleConnect}
                    disabled={!address.trim() || pending}
                    className="shrink-0 text-sm px-4 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {pending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    {t('device.connectAction')}
                  </button>
                </div>
                {connectError && (
                  <p className="text-xs text-red-500 mt-2">
                    {t(CONNECT_ERROR_KEYS[connectError])}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 设备条目区：每行名字、地址、上次连接齐全，改名改地址就地展开输入，本机置顶且不可删。
 * 删除当前连着的主机时先切回本机再删，删除会释放该主机的本地镜像。
 */
function DeviceSection() {
  const { t } = useTranslation();
  const devices = useConnectionStore((s) => s.devices);
  const snapshot = useConnectionStore((s) => s.snapshot);
  const renameDevice = useConnectionStore((s) => s.renameDevice);
  const removeDevice = useConnectionStore((s) => s.removeDevice);
  const updateDeviceAddress = useConnectionStore((s) => s.updateDeviceAddress);
  /** 行内编辑态，field 区分正在改名字还是改地址 */
  const [editing, setEditing] = useState<{
    hostId: string;
    field: 'name' | 'address';
  } | null>(null);
  const [draft, setDraft] = useState('');

  const startEdit = (
    hostId: string,
    field: 'name' | 'address',
    value: string
  ) => {
    setEditing({ hostId, field });
    setDraft(value);
  };

  const commit = () => {
    if (!editing) return;
    const clean = draft.trim();
    if (clean) {
      if (editing.field === 'name') {
        void renameDevice(editing.hostId, clean);
      } else {
        void updateDeviceAddress(editing.hostId, clean);
      }
    }
    setEditing(null);
  };

  const handleRemove = (hostId: string) => {
    if (!window.confirm(t('device.deleteConfirm'))) return;
    void removeDevice(hostId).then((ok) => {
      if (!ok) toast.error(t('device.toast.removeFailed'));
    });
  };

  return (
    <section>
      <div className="text-xs text-muted-foreground mb-2">
        {t('device.title')}
      </div>
      <div className="rounded-[16px] border border-border bg-white divide-y divide-border">
        {devices.map((device) => {
          const editingThis =
            editing?.hostId === device.hostId ? editing.field : null;
          const isLocal = device.hostId === LOCAL_DEVICE_ID;
          return (
            <div key={device.hostId} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-3">
                <StatusDot
                  color={deviceStatusDot[deviceStatus(device, snapshot)]}
                />
                <div className="flex-1 min-w-0">
                  {editingThis === 'name' ? (
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        className="flex-1 min-w-0 text-sm rounded-lg border border-border bg-white px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40"
                      />
                      <button
                        onClick={commit}
                        className="shrink-0 text-xs px-2.5 rounded-lg bg-primary text-primary-foreground"
                      >
                        {t('device.save')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {isLocal
                          ? t('device.local')
                          : deviceDisplayName(device)}
                      </span>
                      {!isLocal && !editingThis && (
                        <button
                          onClick={() =>
                            startEdit(
                              device.hostId,
                              'name',
                              device.name ?? deviceDisplayName(device)
                            )
                          }
                          title={t('device.rename')}
                          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!isLocal && !editingThis && (
                  <button
                    onClick={() => handleRemove(device.hostId)}
                    title={t('device.delete')}
                    className="shrink-0 p-1 rounded text-red-500/80 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 本机没有地址，直连本地服务；远程设备的地址可看可改 */}
              {isLocal ? (
                <div className="pl-[26px] text-xs text-muted-foreground">
                  {t('device.localMeta')}
                </div>
              ) : editingThis === 'address' ? (
                <div className="pl-[26px] flex gap-1.5">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    placeholder={t('device.addressPlaceholder')}
                    className="flex-1 min-w-0 text-xs font-mono rounded-lg border border-border bg-white px-2 py-1 outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <button
                    onClick={commit}
                    className="shrink-0 text-xs px-2.5 rounded-lg bg-primary text-primary-foreground"
                  >
                    {t('device.save')}
                  </button>
                </div>
              ) : (
                <div className="pl-[26px] space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <code className="min-w-0 text-xs font-mono text-muted-foreground break-all">
                      {device.address}
                    </code>
                    {!editingThis && (
                      <button
                        onClick={() =>
                          startEdit(
                            device.hostId,
                            'address',
                            device.address ?? ''
                          )
                        }
                        title={t('device.editAddress')}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('device.lastConnected')}{' '}
                    {formatLastConnected(device.lastConnectedAt, t)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 上次连接时间的相对文案，久远或未知时不显示 */
function formatLastConnected(
  ts: number | null,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!ts) return '';
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return t('device.justNow');
  if (minutes < 60) return t('device.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('device.hoursAgo', { count: hours });
  return t('device.daysAgo', { count: Math.floor(hours / 24) });
}
