'use client';

export default function Links() {
  const LINKS = [
    {
      group: 'Cattle & livestock',
      items: [
        { name: 'CTS Online (BCMS)', desc: 'Cattle registration and movement', url: 'https://www.bcms.gov.uk' },
        { name: 'Bovine TB', desc: 'Testing and compliance', url: 'https://www.gov.uk/guidance/bovine-tb-get-your-cattle-tested' },
        { name: 'AHDB Beef & Lamb', desc: 'Market and technical advice', url: 'https://ahdb.org.uk/beef-and-lamb' },
        { name: 'Red Tractor', desc: 'Farm assurance scheme', url: 'https://www.redtractor.org.uk' }
      ]
    },
    {
      group: 'Schemes & grants',
      items: [
        { name: 'SFI', desc: 'Sustainable Farming Incentive', url: 'https://www.gov.uk/government/collections/sustainable-farming-incentive-guidance' },
        { name: 'CS', desc: 'Countryside Stewardship', url: 'https://www.gov.uk/government/collections/countryside-stewardship-get-paid-to-look-after-the-countryside' },
        { name: 'Rural Payments', desc: 'Submit claims online', url: 'https://www.ruralpayments.org' },
        { name: 'Farming Investment Fund', desc: 'Equipment grants', url: 'https://www.gov.uk/guidance/farming-investment-fund' }
      ]
    },
    {
      group: 'Arable & weather',
      items: [
        { name: 'AHDB Cereals', desc: 'Market data and best practice', url: 'https://ahdb.org.uk/cereals-and-oilseeds' },
        { name: 'Pesticide Register', desc: 'Check spray approvals', url: 'https://www.pesticides.gov.uk' },
        { name: 'Met Office Henley', desc: 'Weather forecast', url: 'https://www.metoffice.gov.uk/weather/forecast/gcpvqhv8n' },
        { name: 'MAGIC Map', desc: 'Environmental data layer', url: 'https://magic.defra.gov.uk' },
        { name: 'Farming UK Prices', desc: 'Grain and commodity prices', url: 'https://www.farminguk.com/prices' },
        { name: 'NFU Online', desc: 'News and market analysis', url: 'https://www.nfuonline.com' }
      ]
    }
  ];

  return (
    <div className="link-grid">
      {LINKS.map((group) => (
        <div key={group.group} className="link-card">
          <div className="link-group-title">{group.group}</div>
          {group.items.map((item) => (
            <a key={item.name} href={item.url} target="_blank" rel="noreferrer" className="row-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ flex: 1 }}>
                <div className="link-name">{item.name}</div>
                <div className="link-desc">{item.desc}</div>
              </div>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
