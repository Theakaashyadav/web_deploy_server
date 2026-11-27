import AgencyLanding from '../components/AgencyLanding';
import { agencyName, whatsappUrl } from '../lib/agency';
import { siteUrl, serializeSchema } from '../lib/seo';

export default function HomePage() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:serializeSchema({'@context':'https://schema.org','@type':'WebPage','@id':siteUrl+'/#webpage',url:siteUrl+'/',name:'Website Development & Digital Marketing Agency in Greater Noida',isPartOf:{'@id':siteUrl+'/#website'},about:{'@id':siteUrl+'/#business'},inLanguage:'en-IN'})}}/><AgencyLanding agencyName={agencyName} whatsappUrl={whatsappUrl} /></>;
}
