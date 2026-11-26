import AgencyLanding from '../components/AgencyLanding';
import { agencyName, whatsappUrl } from '../lib/agency';

export default function HomePage() {
  return <AgencyLanding agencyName={agencyName} whatsappUrl={whatsappUrl} />;
}
