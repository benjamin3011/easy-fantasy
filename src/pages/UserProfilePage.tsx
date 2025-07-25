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
          
          {/* Future profile sections can be added here */}
          {/* <AccountInformation /> */}
          {/* <PrivacySettings /> */}
          {/* <SecuritySettings /> */}
        </div>
      </div>
    </>
  );
} 