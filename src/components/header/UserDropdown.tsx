import { useState, useEffect } from "react";
import { useNavigate } from "react-router";          // react-router v7
import { signOut } from "firebase/auth";
import { auth, db } from "../../firebase/firebase";  //  adjust if paths differ
import { doc, getDoc } from "firebase/firestore";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";

export default function UserDropdown() {
  /* ───────────────────────────────── state ──────────────────────────────── */
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
  }>({});

  const navigate = useNavigate();

  /* ─────────────────────── fetch extra user data once ───────────────────── */
  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setProfile(snap.data() as { firstName?: string; lastName?: string; email?: string });
        } else {
          // fallback: derive a name from displayName
          const [first = "", ...rest] = (user.displayName ?? "").split(" ");
          setProfile({
            firstName: first,
            lastName: rest.join(" "),
            email: user.email ?? "",
          });
        }
      } catch (err) {
        console.error("Could not load user profile:", err);
      }
    };

    fetchProfile();
  }, []);

  /* ─────────────────────── helpers ──────────────────────────────────────── */
  const toggleDropdown = () => setIsOpen((prev) => !prev);
  const closeDropdown  = () => setIsOpen(false);

  /** Sign-out handler */
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      closeDropdown();
      navigate("/signin");     // keep your existing route
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  const fullName =
    `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
    "User";

  /* ─────────────────────── render ───────────────────────────────────────── */
  return (
    <div className="relative">
      {/* ▼ button that opens the dropdown */}
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dropdown-toggle dark:text-gray-400"
      >
        <span className="block mr-1 font-medium text-theme-sm">{fullName}</span>
        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ▼ dropdown menu */}
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        {/* -- user name + email -- */}
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {fullName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {profile.email}
          </span>
        </div>

        {/* -- profile / settings / support -- */}
        <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              to="/profile"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              {/* … svg elided for brevity … */}
              Edit profile
            </DropdownItem>
          </li>
          {/* add other items here */}
        </ul>

        {/* -- sign-out button -- */}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          {/* … svg elided for brevity … */}
          Sign out
        </button>
      </Dropdown>
    </div>
  );
}
