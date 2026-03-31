import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import styles from './Tabs.module.css';

export interface TabsProps extends RadixTabs.TabsProps {
  className?: string;
}

export interface TabsListProps extends RadixTabs.TabsListProps {
  className?: string;
}

export interface TabsTriggerProps extends RadixTabs.TabsTriggerProps {
  className?: string;
  badge?: React.ReactNode;
}

export interface TabsContentProps extends RadixTabs.TabsContentProps {
  className?: string;
}

export function Tabs({ className, children, ...props }: TabsProps) {
  return (
    <RadixTabs.Root className={`${styles.root} ${className ?? ''}`} {...props}>
      {children}
    </RadixTabs.Root>
  );
}

export function TabsList({ className, children, ...props }: TabsListProps) {
  return (
    <RadixTabs.List className={`${styles.list} ${className ?? ''}`} {...props}>
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ className, badge, children, ...props }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger className={`${styles.trigger} ${className ?? ''}`} {...props}>
      {children}
      {badge !== undefined && (
        <span className={styles.badge}>{badge}</span>
      )}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, children, ...props }: TabsContentProps) {
  return (
    <RadixTabs.Content className={`${styles.content} ${className ?? ''}`} {...props}>
      {children}
    </RadixTabs.Content>
  );
}
