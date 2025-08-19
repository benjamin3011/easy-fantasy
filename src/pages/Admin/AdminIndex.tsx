// src/pages/Admin/AdminIndex.tsx
import { NavLink, Outlet } from 'react-router';
import PageMeta from '../../components/common/PageMeta';
import { useAuth } from '../../context/AuthContext';

export default function AdminIndex() {
    const { user, isAdmin, loading } = useAuth();

    if (loading) return <p className='p-4 text-center'>Loading authentication...</p>;
    if (!user) return <p className='p-4 text-center text-red-600'>Please log in to access the Admin Panel.</p>;
    if (!isAdmin) {
        return (
            <div className="p-4 text-center">
                <h1 className='text-xl font-bold text-red-600'>Access Denied</h1>
                <p className='text-gray-600 dark:text-gray-400'>You do not have permission to view this page.</p>
            </div>
        );
    }

    return (
        <>
            <PageMeta title="Admin | Easy Fantasy" description='Admin tools and health checks.' />
            <div className="container mx-auto px-2 py-6 pb-content-safe">
                <div className="mb-6">
                    <div className="hidden md:flex items-center justify-between mb-2">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin</h1>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Administrative tools</p>
                </div>

                <nav className="mb-6 overflow-x-auto">
                    <ul className="flex gap-3 text-sm">
                        <li>
                            <NavLink to="/admin/standings" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Standings</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/health" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Health</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/data" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Data</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/tips" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Tips</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/notifications" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Notifications</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/roles" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Roles</NavLink>
                        </li>
                        <li>
                            <NavLink to="/admin/mock" className={({ isActive }) => `px-3 py-2 rounded-md ${isActive ? 'bg-brand-100 dark:bg-gray-800 text-brand-600 dark:text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Mock</NavLink>
                        </li>
                    </ul>
                </nav>

                <Outlet />
            </div>
        </>
    );
}


