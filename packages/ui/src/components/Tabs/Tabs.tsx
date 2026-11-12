'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { createContext, useContext, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export type TabsVariant = 'soft' | 'solid';

const TabsVariantContext = createContext<TabsVariant>('soft');

export const Tabs = TabsPrimitive.Root;

export type TabsListProps = ComponentPropsWithRef<typeof TabsPrimitive.List> & {
  variant?: TabsVariant;
  /** Mandatory accessible name of the tab list (ET-6). */
  'aria-label': string;
};

export const TabsList = ({ className, variant = 'soft', ...props }: TabsListProps) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-4 p-4',
        variant === 'soft'
          ? 'rounded-12 bg-canvas'
          : 'rounded-14 border border-solid border-border bg-surface',
        className,
      )}
      {...props}
    />
  </TabsVariantContext.Provider>
);

export type TabsTriggerProps = ComponentPropsWithRef<typeof TabsPrimitive.Trigger>;

export const TabsTrigger = ({ className, ...props }: TabsTriggerProps) => {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex cursor-pointer items-center justify-center rounded-9 border-0 bg-transparent px-14 text-ink-muted',
        variant === 'soft'
          ? 'min-h-36 text-13 font-500 data-[state=active]:bg-surface data-[state=active]:font-600 data-[state=active]:text-ink data-[state=active]:shadow-segment'
          : 'min-h-40 rounded-10 text-14 font-500 hover:bg-surface-muted data-[state=active]:bg-ink data-[state=active]:font-600 data-[state=active]:text-white',
        className,
      )}
      {...props}
    />
  );
};

export type TabsContentProps = ComponentPropsWithRef<typeof TabsPrimitive.Content>;

export const TabsContent = ({ className, ...props }: TabsContentProps) => (
  <TabsPrimitive.Content className={cn('mt-12', className)} {...props} />
);
