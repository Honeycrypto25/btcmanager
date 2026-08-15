/** Default expense categories — extendable; not a DB enum on purpose so new
 * categories can be added later without a migration. */
export const EXPENSE_CATEGORIES = [
    "Fuel",
    "Vehicle Maintenance",
    "Vehicle Insurance",
    "Parking",
    "Licences",
    "Accountancy",
    "Advertising",
    "Software",
    "Phone",
    "Office",
    "Equipment",
    "Travel",
    "Bank Fees",
    "Professional Fees",
    "Other",
] as const;
