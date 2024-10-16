import { Link } from '@map-colonies/mc-model-types';

export const linksTemplate = `[
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMS",
    "url": "{{serverUrl}}/service?REQUEST=GetCapabilities"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMS_BASE",
    "url": "{{serverUrl}}/wms"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS",
    "url": "{{serverUrl}}/wmts/1.0.0/WMTSCapabilities.xml"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS_KVP",
    "url": "{{serverUrl}}/service?REQUEST=GetCapabilities&SERVICE=WMTS"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS_BASE",
    "url": "{{serverUrl}}/wmts"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WFS",
    "url": "{{serverUrl}}/wfs?request=GetCapabilities"
  }
]`;

export const getExpectedLinks = (serverUrl: string, layerName: string): Link[] => {
  return [
    {
      name: layerName,
      description: '',
      protocol: 'WMS',
      url: `${serverUrl}/service?REQUEST=GetCapabilities`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMS_BASE',
      url: `${serverUrl}/wms`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS',
      url: `${serverUrl}/wmts/1.0.0/WMTSCapabilities.xml`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS_KVP',
      url: `${serverUrl}/service?REQUEST=GetCapabilities&SERVICE=WMTS`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS_BASE',
      url: `${serverUrl}/wmts`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WFS',
      url: `${serverUrl}/wfs?request=GetCapabilities`,
    },
  ];
};
