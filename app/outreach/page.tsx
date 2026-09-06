import type { Metadata } from "next";
import OutreachForm from "./outreach-form";
import "./outreach.css";

export const metadata: Metadata = {
  title: "Book Crafty — Craft Service for Your Shoot",
  description:
    "Tell us about your shoot and we'll come back with availability and a number — usually same day.",
};

/* Public: no session, no workspace. The only page outside the
   signed-in shell, and the only one anyone on the internet can
   reach. */
export default function OutreachPage() {
  return <OutreachForm />;
}
