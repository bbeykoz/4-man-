'use client';

// watermelon "blog 4" bloğu. Düzen aynı; import yolu @/components/ui/*.
import type { ReactNode } from 'react';
import { ArrowRight, Bookmark, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type BlogAccent = 'violet' | 'green' | 'blue';

export interface BlogArticle {
  category: string;
  readTime: string;
  title: string;
  href?: string;
  accent: BlogAccent;
  imageSrc: string;
  imageAlt: string;
  icon?: LucideIcon;
}

export interface BlogData {
  badge: string;
  heading: string;
  description: string;
  asideText: string;
  viewAllLabel: string;
  viewAllHref: string;
  articles: BlogArticle[];
}

export interface BlogSectionProps {
  data: BlogData;
  className?: string;
  renderViewAllLink?: (props: {
    href: string;
    children: ReactNode;
  }) => ReactNode;
  renderArticleLink?: (props: {
    href: string;
    children: ReactNode;
  }) => ReactNode;
}

const accentClasses: Record<BlogAccent, { dot: string }> = {
  violet: { dot: 'bg-violet-500' },
  green: { dot: 'bg-green-500' },
  blue: { dot: 'bg-blue-500' },
};

export default function BlogSection({
  data,
  className,
  renderViewAllLink,
  renderArticleLink,
}: BlogSectionProps) {
  const viewAll = (
    <Button
      asChild
      variant="ghost"
      className="text-foreground h-auto rounded-none border-b px-0 pb-3 text-lg font-semibold hover:bg-transparent"
    >
      <span>
        {data.viewAllLabel}
        <ArrowRight className="ml-4 size-5" />
      </span>
    </Button>
  );

  return (
    <section className={cn('bg-muted/30 w-full py-8', className)}>
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_400px] lg:items-start lg:gap-10">
          <div>
            <h2 className="text-foreground mt-8 max-w-2xl text-4xl leading-tight font-semibold tracking-tight whitespace-pre-line sm:text-5xl md:text-6xl">
              {data.heading}
            </h2>

            <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
              {data.description}
            </p>
          </div>

          <div className="pt-0 lg:pt-24">
            <p className="text-muted-foreground max-w-sm text-lg leading-relaxed">
              {data.asideText}
            </p>
            <div className="mt-10 w-fit">
              {renderViewAllLink ? (
                renderViewAllLink({
                  href: data.viewAllHref,
                  children: viewAll,
                })
              ) : (
                <a href={data.viewAllHref}>{viewAll}</a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-4">
          {data.articles.map((article) => (
            <BlogArticleCard
              key={`${article.category}-${article.title}`}
              article={article}
              renderArticleLink={renderArticleLink}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function BlogArticleCard({
  article,
  renderArticleLink,
}: {
  article: BlogArticle;
  renderArticleLink?: BlogSectionProps['renderArticleLink'];
}) {
  const accent = accentClasses[article.accent];

  const card = (
    <Card className="group border-border bg-card flex h-full flex-col overflow-hidden rounded-2xl pt-0 pb-4 shadow-sm transition-all hover:shadow-md">
      <div className="relative h-60 overflow-hidden sm:h-64 dark:mask-b-from-50%">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={article.imageSrc}
          alt={article.imageAlt}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        <div className="bg-background/90 text-foreground hover:bg-background absolute top-4 right-4 flex size-10 items-center justify-center rounded-full shadow-sm backdrop-blur-sm transition-colors">
          <Bookmark className="size-5" strokeWidth={1.7} />
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span className={cn('size-2 rounded-full', accent.dot)} />
            <span className="font-medium">{article.category}</span>
          </div>
          <span className="text-muted-foreground shrink-0 text-sm">
            {article.readTime}
          </span>
        </div>

        <h3 className="text-foreground mt-2 mb-2 text-xl font-semibold tracking-tight">
          {article.title}
        </h3>

        <div className="mt-auto">
          <span className="flex items-center gap-0.5">
            Yazıyı oku
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        </div>
      </CardContent>
    </Card>
  );

  if (renderArticleLink && article.href) {
    return renderArticleLink({ href: article.href, children: card });
  }

  if (article.href) {
    return (
      <a
        href={article.href}
        className="focus-visible:ring-ring block rounded-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {card}
      </a>
    );
  }

  return card;
}
