// src/components/auth/ResetPasswordForm.tsx
import { useState } from "react";
import { Link } from "react-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase/firebase";            // <-- adjust if path differs
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import { toast } from "react-hot-toast";                   // <-- or your own toast lib

export default function ResetPasswordForm() {
  const [email,     setEmail]     = useState("");
  const [loading,   setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("Please enter a valid e-mail address");

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email.trim());
      toast.success(
        "Reset link sent! Check the inbox (and spam folder) of “" + email + "”."
      );
    } catch (err: unknown) {
      console.error("Failed to send reset e-mail:", err);
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full lg:w-1/2">
      {/* -- back link -- */}
      <div className="w-full max-w-md pt-10 mx-auto">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <svg
            className="stroke-current"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.7083 5L7.5 10.2083L12.7083 15.4167"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back to dashboard
        </Link>
      </div>

      {/* -- main card -- */}
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
            Forgot Your Password?
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter the email address linked to your account and we’ll send you a
            link to reset your password.
          </p>
        </div>

        {/* -- form -- */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>
              Email<span className="text-error-500">*</span>
            </Label>
            <Input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* -- submit button -- */}
          <Button
            className="w-full"
            size="sm"
            type="submit"
            disabled={loading}
          >
            {loading ? "Sending…" : "Send Reset Link"}
          </Button>
        </form>

        {/* -- bottom link -- */}
        <div className="mt-5">
          <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
            Wait, I remember my password…{" "}
            <Link
              to="/signin"
              className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Click here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
