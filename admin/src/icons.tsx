import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import RedoIcon from '@mui/icons-material/Redo';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import UndoIcon from '@mui/icons-material/Undo';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

export type IconName =
  | 'alert'
  | 'audit'
  | 'bold'
  | 'check'
  | 'customers'
  | 'edit'
  | 'emails'
  | 'entitlements'
  | 'eye'
  | 'info'
  | 'italic'
  | 'layers'
  | 'list'
  | 'listOrdered'
  | 'logout'
  | 'mail'
  | 'key'
  | 'plus'
  | 'profile'
  | 'promotions'
  | 'redo'
  | 'refresh'
  | 'save'
  | 'search'
  | 'sort'
  | 'sortAsc'
  | 'sortDesc'
  | 'subscriptions'
  | 'sync'
  | 'tiers'
  | 'trash'
  | 'undo'
  | 'users'
  | 'x';

const icons: Record<IconName, typeof AddIcon> = {
  alert: WarningAmberOutlinedIcon,
  audit: DescriptionOutlinedIcon,
  bold: FormatBoldIcon,
  check: CheckIcon,
  customers: GroupsOutlinedIcon,
  edit: EditOutlinedIcon,
  emails: MailOutlinedIcon,
  entitlements: VerifiedUserOutlinedIcon,
  eye: VisibilityOutlinedIcon,
  info: InfoOutlinedIcon,
  italic: FormatItalicIcon,
  layers: LayersOutlinedIcon,
  list: FormatListBulletedIcon,
  listOrdered: FormatListNumberedIcon,
  logout: LogoutIcon,
  mail: MailOutlinedIcon,
  key: KeyOutlinedIcon,
  plus: AddIcon,
  profile: PersonOutlinedIcon,
  promotions: LocalOfferOutlinedIcon,
  redo: RedoIcon,
  refresh: RefreshIcon,
  save: SaveOutlinedIcon,
  search: SearchIcon,
  sort: UnfoldMoreIcon,
  sortAsc: KeyboardArrowUpIcon,
  sortDesc: KeyboardArrowDownIcon,
  subscriptions: CreditCardIcon,
  sync: SyncIcon,
  tiers: LayersOutlinedIcon,
  trash: DeleteOutlinedIcon,
  undo: UndoIcon,
  users: GroupsOutlinedIcon,
  x: CloseIcon,
};

export function Icon({ name, className = 'icon', title }: { name: IconName; className?: string; title?: string }) {
  const IconComponent = icons[name];
  return <IconComponent className={className} titleAccess={title} />;
}
