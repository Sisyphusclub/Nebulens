import {
  Bot,
  Compass,
  FolderOpen,
  Image,
  LayoutTemplate,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface AppNavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

// The Agent's canvas comes right after the home page: it is the product's main workspace, and
// 生图 stays as the quick way to make single pictures. Its Bot icon is the composer's Agent mode.
const primaryNavigation = [
  { label: '发现', to: '/', icon: Compass },
  { label: 'Agent 画布', to: '/agent', icon: Bot },
  { label: '生图', to: '/generate', icon: Image },
  { label: '创作模板', to: '/templates', icon: LayoutTemplate },
  { label: '资产', to: '/history', icon: FolderOpen },
] as const satisfies readonly AppNavigationItem[];

const adminNavigation = {
  label: '用户管理',
  to: '/admin/users',
  icon: Users,
} as const satisfies AppNavigationItem;

export function getAppNavigation(isAdmin = false): readonly AppNavigationItem[] {
  return isAdmin ? [...primaryNavigation, adminNavigation] : primaryNavigation;
}
