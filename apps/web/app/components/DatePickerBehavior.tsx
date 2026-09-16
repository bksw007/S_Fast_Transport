"use client";

import { useEffect } from "react";
import { installDatePickerClick } from "@/lib/date-picker";

export default function DatePickerBehavior() {
  useEffect(() => installDatePickerClick(), []);
  return null;
}
