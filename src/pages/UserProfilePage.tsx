import PageMeta from '../components/common/PageMeta';
import NotificationSettings from '../components/common/NotificationSettings';

export default function UserProfilePage() {
  return (
    <>
      <PageMeta 
        title="User Profile - Easy Fantasy" 
        description="Manage your profile, notification preferences and account settings" 
      />
      
      <div className="container mx-auto px-4 py-6 pb-content-safe">
        {/* Header Section - Consistent with other pages */}
        <div className="mb-6">
          {/* Desktop: Show page title */}
          <div className="hidden md:flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              User Profile
            </h1>
          </div>
          
          {/* Subtitle for both mobile and desktop */}
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Manage your notification preferences and account settings
          </p>
        </div>
        
        <div className="space-y-8">
          <NotificationSettings />
          
          {/* Future profile sections can be added here */}
          {/* <AccountInformation /> */}
          {/* <PrivacySettings /> */}
          {/* <SecuritySettings /> */}
        </div>
      </div>
    </>
  );
} 