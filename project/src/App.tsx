import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoadingState } from '@/components/ui/Feedback';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const CandidateEntryPage = lazy(() => import('@/pages/CandidateEntryPage'));
const CandidatePortalPage = lazy(() => import('@/pages/CandidatePortalPage'));
const ReviewerQueuePage = lazy(() => import('@/pages/reviewer/ReviewerQueuePage'));
const ReviewerWorkspacePage = lazy(() => import('@/pages/reviewer/ReviewerWorkspacePage'));
const EmployerHomePage = lazy(() => import('@/pages/employer/EmployerHomePage'));
const PipelinePage = lazy(() => import('@/pages/employer/PipelinePage'));
const CandidatesPage = lazy(() => import('@/pages/employer/CandidatesPage'));
const JobProfilesPage = lazy(() => import('@/pages/employer/JobProfilesPage'));
const TeamPage = lazy(() => import('@/pages/employer/TeamPage'));
const CompliancePage = lazy(() => import('@/pages/employer/CompliancePage'));
const DataRightsPage = lazy(() => import('@/pages/employer/DataRightsPage'));
const AnalyticsPage = lazy(() => import('@/pages/employer/AnalyticsPage'));
const ReviewsPage = lazy(() => import('@/pages/employer/ReviewsPage'));
const EvidenceProfilePage = lazy(() => import('@/pages/employer/EvidenceProfilePage'));
const PlatformOverviewPage = lazy(() => import('@/pages/platform/PlatformOverviewPage'));
const PlatformOrgsPage = lazy(() => import('@/pages/platform/PlatformOrgsPage'));
const PlatformAnalyticsPage = lazy(() => import('@/pages/platform/PlatformAnalyticsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary label="Application">
        <Suspense fallback={<LoadingState />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/candidate" element={<CandidateEntryPage />} />
            <Route path="/candidate/:token" element={<CandidatePortalPage />} />
            <Route path="/candidate/assessments/:attemptId/workspace" element={<CandidatePortalPage />} />
            <Route path="/candidate/*" element={<CandidatePortalPage />} />

            {/* Employer admin */}
            <Route path="/org/:orgId" element={
              <ProtectedRoute allowedRoles={['employer_admin', 'reviewer']}>
                <EmployerHomePage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/sessions" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <PipelinePage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/candidates" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <CandidatesPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/job-profiles" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <JobProfilesPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/team" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <TeamPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/compliance" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <CompliancePage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/data-rights" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <DataRightsPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/analytics" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <AnalyticsPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/reviews" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <ReviewsPage />
              </ProtectedRoute>
            } />
            <Route path="/org/:orgId/sessions/:sessionId/profile" element={
              <ProtectedRoute allowedRoles={['employer_admin', 'reviewer']}>
                <EvidenceProfilePage />
              </ProtectedRoute>
            } />

            {/* Reviewer */}
            <Route path="/reviews/queue" element={
              <ProtectedRoute allowedRoles={['reviewer']}>
                <ReviewerQueuePage />
              </ProtectedRoute>
            } />
            <Route path="/reviews/:reviewId" element={
              <ProtectedRoute allowedRoles={['reviewer']}>
                <ReviewerWorkspacePage />
              </ProtectedRoute>
            } />

            {/* Platform admin */}
            <Route path="/platform" element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <PlatformOverviewPage />
              </ProtectedRoute>
            } />
            <Route path="/platform/organisations" element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <PlatformOrgsPage />
              </ProtectedRoute>
            } />
            <Route path="/platform/analytics" element={
              <ProtectedRoute allowedRoles={['platform_admin']}>
                <PlatformAnalyticsPage />
              </ProtectedRoute>
            } />

            {/* Templates */}
            <Route path="/templates" element={
              <ProtectedRoute allowedRoles={['employer_admin']}>
                <JobProfilesPage />
              </ProtectedRoute>
            } />

            {/* Fallbacks */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  );
}
