/**
 * @file 设备清单浮层，左下角设备入口点开。
 * 行内只有状态点与设备名，选中高亮即当前设备的全部表达。
 * 点击条目即切换，失败与离线都有 toast 反馈。
 * 底部唯一的管理设备进设备管理页，新建连接与条目维护都收在页面里。
 */
import { Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { StatusDot } from '../ui/StatusDot';
import { toast } from '../../stores/toastStore';
import {
  useConnectionStore,
  currentDeviceKey,
  deviceDisplayName,
  deviceStatus,
} from '../../stores/connectionStore';
import { LOCAL_DEVICE_ID } from '@shared/api';

/** 状态点配色，设备清单浮层与设备管理页共用 */
export const deviceStatusDot: Record<string, string> = {
  online: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  offline: 'bg-muted-foreground/40',
};

export function DeviceListPopover({
  onClose,
  onOpenDeviceManage,
}: {
  onClose: () => void;
  onOpenDeviceManage: () => void;
}) {
  const { t } = useTranslation();
  const devices = useConnectionStore((s) => s.devices);
  const snapshot = useConnectionStore((s) => s.snapshot);
  const switchHost = useConnectionStore((s) => s.switchHost);
  const currentKey = snapshot ? currentDeviceKey(snapshot) : LOCAL_DEVICE_ID;

  const handleSwitch = (hostId: string, address: string | null) => {
    void switchHost(hostId, address).then((result) => {
      if (!result?.ok) {
        toast.error(t('device.toast.switchFailed'));
      }
    });
    onClose();
  };

  return (
    <>
      {/* 透明遮罩只负责点外关闭，浮层本体挂在调用方的相对容器上 */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-[calc(100%+8px)] bottom-0 z-50 w-64 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
        {/* 头部标题说明这份清单的含义，当前连着谁 */}
        <div className="px-3 pt-2.5 pb-1">
          <span className="text-xs text-muted-foreground">
            {t('device.title')}
          </span>
        </div>

        {/* 设备行：状态点加名字，选中高亮就是当前设备的含义 */}
        <div className="max-h-64 overflow-y-auto">
          {devices.map((device) => {
            const selected = device.hostId === currentKey;
            return (
              <button
                key={device.hostId}
                onClick={() => handleSwitch(device.hostId, device.address)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                  selected ? 'bg-primary/10' : 'hover:bg-muted'
                )}
              >
                <StatusDot
                  color={deviceStatusDot[deviceStatus(device, snapshot)]}
                />
                <span
                  className={cn(
                    'flex-1 truncate text-sm',
                    selected ? 'text-foreground font-medium' : 'text-foreground'
                  )}
                >
                  {device.hostId === LOCAL_DEVICE_ID
                    ? t('device.local')
                    : deviceDisplayName(device)}
                </span>
              </button>
            );
          })}
        </div>

        {/* 底部进管理页 */}
        <button
          onClick={() => {
            onOpenDeviceManage();
            onClose();
          }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-t border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {t('device.manage')}
        </button>
      </div>
    </>
  );
}
