"use client";

import { useActionState } from "react";
import { onboardOrganizationAction } from "@/domains/identity/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(onboardOrganizationAction, undefined);

  return (
    <section>
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Organization Onboarding</h1>
        <p className="mt-3 text-sm font-medium text-gray-500">
          Create an organization to unlock organizer routes.
        </p>
      </header>

      <form action={formAction} className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700">Legal name</label>
          <Input
            required
            name="legalName"
            type="text"
            className="mt-2 bg-gray-50"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-700">Display name</label>
          <Input
            required
            name="displayName"
            type="text"
            className="mt-2 bg-gray-50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700">Default currency</label>
          <Input
            required
            name="defaultCurrency"
            type="text"
            maxLength={3}
            placeholder="USD"
            className="mt-2 bg-gray-50 uppercase"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700">Region</label>
          <Input
            required
            name="region"
            type="text"
            placeholder="US"
            className="mt-2 bg-gray-50"
          />
        </div>

        {state?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 md:col-span-2">
            {state.error}
          </div>
        ) : null}

        <div className="md:col-span-2 pt-2">
          <Button type="submit" disabled={pending} className="w-full bg-orange-500 hover:bg-orange-600">
            {pending ? "Creating organization..." : "Create organization"}
          </Button>
        </div>
      </form>
    </section>
  );
}
