"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/domains/identity/actions";
import { Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInAction, undefined);

  return (
    <section>
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Sign In</h1>
        <p className="mt-3 text-sm font-medium text-gray-500">
          Welcome back. Access your workspace below.
        </p>
      </header>

      <form action={formAction} className="mt-8 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700">Email Address</label>
          <div className="relative mt-2 flex items-center">
            <Mail className="absolute left-3 h-5 w-5 text-gray-400" />
            <Input
              required
              name="email"
              type="email"
              autoComplete="email"
              className="bg-gray-50 pl-10"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700">Password</label>
          <div className="relative mt-2 flex items-center">
            <Lock className="absolute left-3 h-5 w-5 text-gray-400" />
            <Input
              required
              name="password"
              type="password"
              autoComplete="current-password"
              className="bg-gray-50 pl-10"
            />
          </div>
        </div>

        {state?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {state.error}
          </div>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-4 w-full bg-orange-500 hover:bg-orange-600">
          {pending ? "Signing in..." : "Sign in to Dashboard"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm font-medium text-gray-500">
        No account yet?{" "}
        <Link href="/register" className="text-orange-500 transition-colors hover:text-orange-600">
          Create one
        </Link>
      </p>
    </section>
  );
}
