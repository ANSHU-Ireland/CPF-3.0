/**
 * Centralised route path builders. Never hand-write a `/org/:orgId/...`
 * string elsewhere — import from here so route params can't drift from
 * the route table declared in main.tsx.
 */
export const routes = {
  login: () => '/login',
  candidateEntry: () => '/candidate',
  candidatePortal: (token: string) => `/candidate/${encodeURIComponent(token)}`,

  platformOrgs: () => '/platform/organisations',
  platformAnalytics: () => '/platform/analytics',

  orgSessions: (orgId: string) => `/org/${orgId}/sessions`,
  orgCandidates: (orgId: string) => `/org/${orgId}/candidates`,
  orgJobProfiles: (orgId: string) => `/org/${orgId}/job-profiles`,
  orgTeam: (orgId: string) => `/org/${orgId}/team`,
  orgDataRights: (orgId: string) => `/org/${orgId}/data-rights`,
  orgCompliance: (orgId: string) => `/org/${orgId}/compliance`,
  orgAnalytics: (orgId: string) => `/org/${orgId}/analytics`,
  orgReviews: (orgId: string) => `/org/${orgId}/reviews`,
  orgReview: (orgId: string, reviewId: string) =>
    `/org/${orgId}/reviews/${reviewId}`,
  sessionProfile: (orgId: string, sessionId: string) =>
    `/org/${orgId}/sessions/${sessionId}/profile`,

  orgLearningHome: (orgId: string) => `/org/${orgId}/learning`,
  orgLearningAdmin: (orgId: string) => `/org/${orgId}/learning/admin`,
  orgLearningCourseBuilder: (orgId: string, courseId: string) =>
    `/org/${orgId}/learning/admin/courses/${courseId}`,
  orgLearningPathways: (orgId: string) => `/org/${orgId}/learning/pathways`,
  orgLearningLesson: (orgId: string, enrollmentId: string, lessonId: string) =>
    `/org/${orgId}/learning/enrollments/${enrollmentId}/lessons/${lessonId}`,
  orgLearningManagerView: (orgId: string) =>
    `/org/${orgId}/learning/manager-view`,
  orgLearningSkillsProfile: (orgId: string) =>
    `/org/${orgId}/learning/skills-profile`,

  orgIntelligenceSettings: (orgId: string) =>
    `/org/${orgId}/intelligence/settings`,
  orgPainPoints: (orgId: string) => `/org/${orgId}/intelligence/pain-points`,
  orgIntelligenceInsights: (orgId: string) =>
    `/org/${orgId}/intelligence/insights`,
  orgIntelligenceTransparency: (orgId: string) =>
    `/org/${orgId}/intelligence/transparency`,

  orgWorkflowInsights: (orgId: string) => `/org/${orgId}/workflow-insights`,

  templates: () => '/templates',
};

export type Role = 'platform_admin' | 'employer_admin' | 'reviewer' | 'candidate';

export interface NavItem {
  label: string;
  to: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function employerNav(orgId: string): NavGroup[] {
  return [
    {
      label: 'Home',
      items: [{ label: 'Role home', to: `/org/${orgId}`, icon: 'Home' }],
    },
    {
      label: 'Assessments',
      items: [
        { label: 'Pipeline', to: routes.orgSessions(orgId), icon: 'ClipboardList' },
        { label: 'Candidates', to: routes.orgCandidates(orgId), icon: 'Users' },
        { label: 'Job profiles', to: routes.orgJobProfiles(orgId), icon: 'Briefcase' },
        { label: 'Templates', to: routes.templates(), icon: 'FileText' },
      ],
    },
    {
      label: 'Reviews',
      items: [
        { label: 'Work allocation', to: routes.orgReviews(orgId), icon: 'ClipboardCheck' },
        { label: 'Evidence Profiles', to: `/org/${orgId}/evidence-profiles`, icon: 'ScrollText' },
      ],
    },
    {
      label: 'People',
      items: [{ label: 'Team & permissions', to: routes.orgTeam(orgId), icon: 'Users' }],
    },
    {
      label: 'Insights',
      items: [{ label: 'Analytics', to: routes.orgAnalytics(orgId), icon: 'BarChart3' }],
    },
    {
      label: 'Governance',
      items: [
        { label: 'Compliance', to: routes.orgCompliance(orgId), icon: 'ShieldAlert' },
        { label: 'Data rights', to: routes.orgDataRights(orgId), icon: 'ShieldCheck' },
        { label: 'Audit & exports', to: `/org/${orgId}/audit`, icon: 'FileClock' },
      ],
    },
    {
      label: 'Settings',
      items: [{ label: 'Organisation settings', to: `/org/${orgId}/settings`, icon: 'Settings' }],
    },
  ];
}

export const platformAdminNav: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Platform overview', to: '/platform', icon: 'LayoutDashboard' }],
  },
  {
    label: 'Organisations',
    items: [{ label: 'Directory', to: routes.platformOrgs(), icon: 'Building2' }],
  },
  {
    label: 'Plans & modules',
    items: [{ label: 'Plans', to: '/platform/plans', icon: 'CreditCard' }],
  },
  {
    label: 'Platform analytics',
    items: [{ label: 'Analytics', to: routes.platformAnalytics(), icon: 'BarChart3' }],
  },
  {
    label: 'Compliance & risk',
    items: [{ label: 'Compliance', to: '/platform/compliance', icon: 'ShieldCheck' }],
  },
  {
    label: 'Support access',
    items: [{ label: 'Support', to: '/platform/support', icon: 'LifeBuoy' }],
  },
  {
    label: 'Audit & exports',
    items: [{ label: 'Audit', to: '/platform/audit', icon: 'FileClock' }],
  },
];

export const reviewerNav: NavGroup[] = [
  {
    label: 'My review queue',
    items: [{ label: 'Queue', to: '/reviews/queue', icon: 'Inbox' }],
  },
  {
    label: 'Guidance',
    items: [{ label: 'Guidance', to: '/reviews/guidance', icon: 'BookOpen' }],
  },
];

import {
  Building2,
  LayoutDashboard,
  CreditCard,
  BarChart3,
  ShieldCheck,
  LifeBuoy,
  FileClock,
  Home,
  ClipboardList,
  Users,
  Briefcase,
  FileText,
  ClipboardCheck,
  ScrollText,
  ShieldAlert,
  Settings,
  Inbox,
  BookOpen,
  HelpCircle,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  CreditCard,
  BarChart3,
  ShieldCheck,
  LifeBuoy,
  FileClock,
  Home,
  ClipboardList,
  Users,
  Briefcase,
  FileText,
  ClipboardCheck,
  ScrollText,
  ShieldAlert,
  Settings,
  Inbox,
  BookOpen,
  HelpCircle,
  GraduationCap,
};
