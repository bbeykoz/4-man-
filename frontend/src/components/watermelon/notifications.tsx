'use client';

// watermelon "notification 3" bloğu. Düzen, sekmeler ve kapatma davranışı aslındaki gibi.
// Değişenler: import yolu @/components/ui/*, dış sunucudaki avatarlar yerine baş harfler,
// içerik panelin gerçek bildirimlerine göre Türkçe.
import React, { useState } from 'react';
import {
  RiNotification3Fill,
  RiCheckFill,
  RiFileTextFill,
  RiSettings4Fill,
  RiArrowRightSFill,
  RiCircleFill,
  RiCloseFill,
} from 'react-icons/ri';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export type ActivityKind =
  | 'kayit'
  | 'kalite'
  | 'risk'
  | 'transfer'
  | 'anomali'
  | 'rapor';

export type ActivityTab = 'all' | 'activity' | 'tasks' | 'digest';

export interface ActivityActor {
  name: string;
  initials: string;
}

export interface ActivityAttachment {
  label: string;
  meta: string;
}

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  actor: ActivityActor;
  workspace: string;
  summary: string;
  timestamp: string;
  isNew: boolean;
  isTask: boolean;
  isDigest: boolean;
  attachment?: ActivityAttachment;
  actions?: { label: string; variant: 'default' | 'outline' }[];
}

export interface NotificationsProps {
  title?: string;
  items?: ActivityItem[];
  className?: string;
}

const KindColorMap: Record<ActivityKind, string> = {
  kayit: 'bg-primary/10 text-primary',
  kalite: 'bg-secondary text-secondary-foreground',
  risk: 'bg-destructive/10 text-destructive',
  transfer: 'bg-muted text-muted-foreground',
  anomali: 'bg-destructive/10 text-destructive',
  rapor: 'bg-muted text-muted-foreground',
};

const KindLabelMap: Record<ActivityKind, string> = {
  kayit: 'Kayıt',
  kalite: 'Kalite',
  risk: 'Risk',
  transfer: 'Transfer',
  anomali: 'Anomali',
  rapor: 'Rapor',
};

const defaultItems: ActivityItem[] = [
  {
    id: '1',
    kind: 'kayit',
    actor: { name: 'Mal kabul', initials: 'MK' },
    workspace: 'Ana Depo',
    summary: 'PO-202609-00010 teslim alındı — 50 adet, lot 2026-09.',
    timestamp: 'Az önce',
    isNew: true,
    isTask: false,
    isDigest: false,
  },
  {
    id: '2',
    kind: 'kalite',
    actor: { name: 'Kalite kontrol', initials: 'KK' },
    workspace: 'Ana Depo',
    summary: 'İki kayıt kalite kontrolü bekliyor; mal karantinada duruyor.',
    timestamp: '12 dk önce',
    isNew: true,
    isTask: true,
    isDigest: false,
    actions: [
      { label: 'Sonra', variant: 'outline' },
      { label: 'Kontrol et', variant: 'default' },
    ],
  },
  {
    id: '3',
    kind: 'risk',
    actor: { name: 'Stok riski', initials: 'SR' },
    workspace: 'ABC-125',
    summary:
      'Tahmini stok bitişi 6 gün. Tedarik süresi 10 gün; 120 adet sipariş önerildi.',
    timestamp: '1 sa önce',
    isNew: true,
    isTask: true,
    isDigest: false,
    actions: [
      { label: 'Yok say', variant: 'outline' },
      { label: 'Taslak sipariş', variant: 'default' },
    ],
  },
  {
    id: '4',
    kind: 'transfer',
    actor: { name: 'Transfer önerisi', initials: 'TÖ' },
    workspace: 'İstanbul deposu',
    summary:
      'Ana Depo’da fazla, İstanbul’da eksik: 80 adet transfer önerildi.',
    timestamp: '3 sa önce',
    isNew: false,
    isTask: false,
    isDigest: true,
  },
  {
    id: '5',
    kind: 'anomali',
    actor: { name: 'Gece taraması', initials: 'GT' },
    workspace: 'Ana Depo',
    summary:
      'Mesai dışı çıkış kaydı ve %10 üzeri sayım farkı bulundu, yetkiliye bildirildi.',
    timestamp: 'Dün',
    isNew: false,
    isTask: false,
    isDigest: true,
  },
  {
    id: '6',
    kind: 'rapor',
    actor: { name: 'Haftalık özet', initials: 'HÖ' },
    workspace: 'Tüm depolar',
    summary: '372 hareket, 4 kritik ürün, 7 SKT riskli lot, 0 kayıp kayıt.',
    timestamp: 'Dün',
    isNew: false,
    isTask: false,
    isDigest: true,
    attachment: { label: 'haftalik-rapor.xlsx', meta: '1,2 MB' },
  },
];

function TabPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-[inset_0_2px_4px_0_rgba(255,255,255,0.5),inset_0_-2px_4px_0_rgba(0,0,0,0.1)] dark:shadow-[inset_0_-2px_4px_0_rgba(0,0,0,0.1),inset_0_2px_4px_0_rgba(255,255,255,0.08)]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'flex h-4 min-w-[16px] items-center justify-center rounded-full text-[9px] font-bold tabular-nums',
            active
              ? 'bg-primary-foreground/50 text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function AttachmentChip({ attachment }: { attachment: ActivityAttachment }) {
  return (
    <div className="border-border bg-muted/40 mt-2.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5">
      <RiFileTextFill className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span className="text-foreground text-xs font-medium">
        {attachment.label}
      </span>
      <span className="text-muted-foreground text-xs">· {attachment.meta}</span>
    </div>
  );
}

function ActivityRow({
  item,
  onDismiss,
}: {
  item: ActivityItem;
  onDismiss: (id: string) => void;
}) {
  const iconColor = KindColorMap[item.kind];

  return (
    <div className="group hover:bg-muted/40 relative flex gap-3 px-4 py-3 transition-colors duration-150">
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">
            {item.actor.initials}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-foreground text-sm font-semibold">
              {item.actor.name}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'h-4 shrink-0 rounded-full border-0 px-1.5 text-[10px] font-semibold',
                iconColor,
              )}
            >
              {KindLabelMap[item.kind]}
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground/60 text-xs tabular-nums">
              {item.timestamp}
            </span>
            <button
              onClick={() => onDismiss(item.id)}
              className="text-muted-foreground/40 hover:text-muted-foreground rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Bildirimi kapat"
            >
              <RiCloseFill className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <p className="text-muted-foreground mt-0.5 text-xs font-medium">
          {item.workspace}
        </p>

        <p className="text-foreground/80 mt-1 text-sm leading-snug">
          {item.summary}
        </p>

        {item.attachment && <AttachmentChip attachment={item.attachment} />}

        {item.actions && item.actions.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            {item.actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant}
                size="sm"
                className="h-7 rounded-full px-3 text-xs font-semibold shadow-[inset_0_2px_4px_0_rgba(255,255,255,0.5),inset_0_-2px_4px_0_rgba(0,0,0,0.1)] dark:shadow-[inset_0_-2px_4px_0_rgba(0,0,0,0.1),inset_0_2px_4px_0_rgba(255,255,255,0.08)]"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Notifications({
  title = 'Bildirimler',
  items = defaultItems,
  className,
}: NotificationsProps) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visible = items.filter((i) => !dismissed.has(i.id));
  const newCount = visible.filter((i) => i.isNew).length;
  const taskCount = visible.filter((i) => i.isTask).length;
  const digestCount = visible.filter((i) => i.isDigest).length;

  const filtered =
    activeTab === 'all'
      ? visible
      : activeTab === 'activity'
        ? visible.filter((i) => i.isNew)
        : activeTab === 'tasks'
          ? visible.filter((i) => i.isTask)
          : visible.filter((i) => i.isDigest);

  const tabs: { id: ActivityTab; label: string; count?: number }[] = [
    { id: 'all', label: 'Tümü', count: visible.length },
    { id: 'activity', label: 'Yeni', count: newCount },
    { id: 'tasks', label: 'Görev', count: taskCount },
    { id: 'digest', label: 'Özet', count: digestCount },
  ];

  return (
    <section
      className={cn('bg-background flex items-center justify-center', className)}
    >
      <Card className="w-full max-w-2xl gap-0 overflow-hidden rounded-3xl p-0 shadow-xs">
        <CardHeader className="px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-xl">
                <RiNotification3Fill className="text-primary h-4 w-4" />
              </div>
              <div>
                <h2 className="text-foreground text-base font-bold tracking-tight">
                  {title}
                </h2>
                <p className="text-muted-foreground text-[11px] font-medium">
                  {newCount > 0 ? `${newCount} yeni` : 'Hepsi okundu'} ·{' '}
                  {visible.length} kayıt
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:bg-primary/5 h-8 gap-1 rounded-xl px-3 text-xs font-semibold"
              onClick={() =>
                setDismissed(
                  new Set(items.filter((i) => i.isNew).map((i) => i.id)),
                )
              }
            >
              <RiCheckFill className="h-3.5 w-3.5" />
              Yenileri temizle
            </Button>
          </div>

          <div className="mt-1 flex items-center gap-1">
            {tabs.map((tab) => (
              <TabPill
                key={tab.id}
                label={tab.label}
                count={tab.count}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[340px] w-full">
            {filtered.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                  <RiNotification3Fill className="text-muted-foreground h-5 w-5 opacity-40" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">
                  Burada bir şey yok
                </p>
              </div>
            ) : (
              <div>
                {filtered.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    <ActivityRow item={item} onDismiss={handleDismiss} />
                    {idx < filtered.length - 1 && (
                      <Separator className="mx-4 w-auto" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>

        <CardFooter className="border-border border-t px-5 py-3">
          <div className="flex w-full items-center justify-between">
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <RiCircleFill className="text-primary h-1.5 w-1.5" />
              <span>{newCount > 0 ? `${newCount} okunmamış` : 'Güncel'}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 gap-0.5 rounded-lg px-2 text-xs font-medium"
            >
              <RiSettings4Fill className="h-3.5 w-3.5" />
              Ayarlar
              <RiArrowRightSFill className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </section>
  );
}
