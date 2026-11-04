import React from 'react';
import {createRoot} from 'react-dom/client';
import {Emp001Configuration} from '../emp001-configuration';
const tenantId=new URLSearchParams(location.search).get('tenant')||'';
createRoot(document.getElementById('root')!).render(<Emp001Configuration tenantId={tenantId}/>);
