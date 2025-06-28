import PageMeta from '../components/common/PageMeta';
import PageBreadcrumb from '../components/common/PageBreadCrumb';
import NotificationSettings from '../components/common/NotificationSettings';

export default function UserProfilePage() {
  return (
    <>
      <PageMeta 
        title="User Profile - Easy Fantasy" 
        description="Manage your profile, notification preferences and account settings" 
      />
      
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PageBreadcrumb pageTitle="User Profile" />
        
        <div className="mt-8 space-y-8">
          <NotificationSettings />
          
          {/* Temporary Testing Section - Remove after testing */}
          <div className="rounded-lg bg-white p-6 shadow dark:bg-gray-800">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              🧪 Testing Tools (iOS PWA)
            </h3>
            <div className="space-y-3">
              <a 
                href="/test-ios-notifications.html"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                📱 iOS Notification Test
              </a>
              <a 
                href="/test-notification.html"
                className="ml-3 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
              >
                🖥️ Desktop Test
              </a>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              These links will be removed after testing is complete.
            </p>
          </div>
          
          {/* Future profile sections can be added here */}
          {/* <AccountInformation /> */}
          {/* <PrivacySettings /> */}
          {/* <SecuritySettings /> */}
        </div>
      </div>
    </>
  );
} 