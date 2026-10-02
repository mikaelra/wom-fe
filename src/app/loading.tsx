import LoadingState from '@/components/loading/LoadingState';

// Next's route-level loading UI: shown while a page's code loads during
// navigation (between scenes, and the profile-menu pages).
export default function Loading() {
  return <LoadingState className="min-h-screen" />;
}
