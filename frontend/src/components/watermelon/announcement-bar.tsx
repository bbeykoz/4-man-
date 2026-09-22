'use client';

// watermelon "announcement 1" bloğu. Kaynak düzen aynı; iki ekleme yapıldı:
// import yolu @/components/ui/*, metinler prop, X düğmesi şeridi gerçekten kapatıyor.
import { useState } from 'react';
import { X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { HiRocketLaunch } from 'react-icons/hi2';

export interface AnnouncementBarProps {
  badgeText?: string;
  message?: string;
  linkLabel?: string;
  linkUrl?: string;
}

export default function AnnouncementBar({
  badgeText = 'NEW',
  message = 'New dashboard experience is live with faster load times and smoother navigation.',
  linkLabel = 'Explore now',
  linkUrl = '#',
}: AnnouncementBarProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="border-primary flex w-full items-center justify-between border-b px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Badge variant="default" className="text-xs">
            {badgeText}
          </Badge>

          <p className="text-muted-foreground flex items-center gap-2 truncate">
            {message}
          </p>
          <a href={linkUrl} className="group flex items-center gap-1">
            <span className="text-primary before:bg-primary relative flex cursor-pointer items-center gap-1 truncate font-medium before:absolute before:-bottom-1 before:left-0 before:h-[1px] before:w-full before:origin-right before:scale-x-0 before:transition-transform before:duration-300 before:ease-out group-hover:before:scale-x-100">
              {linkLabel}
            </span>
            <HiRocketLaunch className="text-primary h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Duyuruyu kapat"
          onClick={() => setVisible(false)}
          className="text-primary hover:text-primary/50 cursor-pointer rounded-lg hover:bg-transparent hover:dark:bg-transparent"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
