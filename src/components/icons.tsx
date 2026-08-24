/**
 * The icon vocabulary.
 *
 * One file, so each meaning has exactly one glyph across all four portals.
 * A triangle that means "danger" on the clinician screen and "information"
 * on the citizen screen teaches people to ignore it.
 *
 * Two rules follow from the audience — clinicians on shared desktops,
 * citizens on mid-range Android phones, ~78% adult literacy:
 *
 *   1. An icon NEVER replaces a label. It sits beside the words, so someone
 *      who cannot read the icon still reads the sentence, and someone using
 *      a screen reader is not told "triangle". Every icon here is
 *      `aria-hidden`, because the text next to it already says the thing.
 *
 *   2. Severity is not carried by the icon alone. The SafetyBanner already
 *      encodes it in shape AND weight AND colour; an icon is a fourth
 *      channel, not a replacement for the other three.
 */
import {
  AlertTriangle,
  Circle,
  Pill,
  Activity,
  CalendarDays,
  Building2,
  Stethoscope,
  User,
  Users,
  ShieldCheck,
  Eye,
  FileText,
  Phone,
  Mail,
  IdCard,
  MapPin,
  Baby,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Camera,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon };

/**
 * What each icon means. Named by MEANING, not by shape, so a component asks
 * for `Icons.allergy` rather than `AlertTriangle` and the vocabulary can be
 * changed in one place.
 */
export const Icons = {
  // Clinical
  allergy: AlertTriangle,
  allergyMild: Circle,
  medication: Pill,
  condition: Activity,
  visit: CalendarDays,
  diagnosis: Stethoscope,

  // People and places
  facility: Building2,
  clinician: Stethoscope,
  citizen: User,
  family: Users,
  child: Baby,

  // Record and trust
  record: FileText,
  access: Eye,
  verified: ShieldCheck,
  confirmed: CheckCircle2,
  notConfirmed: XCircle,
  pending: Clock,

  // Contact and identity
  phone: Phone,
  email: Mail,
  nationalId: IdCard,
  location: MapPin,
  photo: Camera,
  search: Search,
} as const;

export type IconName = keyof typeof Icons;

/**
 * An icon beside a label.
 *
 * The icon is decorative by construction — `aria-hidden` — because the
 * label beside it already carries the meaning. A screen reader that
 * announced both would say the thing twice.
 */
export function Icon({
  name,
  className = '',
  size = 16,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  const Glyph = Icons[name];
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * A label with its icon, as one unit.
 *
 * Used for the column headings on both identity strips, where the icon
 * gives a fast visual anchor and the words carry the meaning.
 */
export function IconLabel({
  name,
  children,
  className = '',
  iconClassName = '',
}: {
  name: IconName;
  children: React.ReactNode;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon name={name} size={13} className={iconClassName} />
      {children}
    </span>
  );
}
