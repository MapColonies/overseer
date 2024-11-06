import { Link } from '@map-colonies/mc-model-types';
import { ILinkBuilderData } from '../../../src/utils/linkBuilder';

export const linksTemplate = `[
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMS",
    "url": "{{mapproxyUrl}}/service?REQUEST=GetCapabilities"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMS_BASE",
    "url": "{{mapproxyUrl}}/wms"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS",
    "url": "{{mapproxyUrl}}/wmts/1.0.0/WMTSCapabilities.xml"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS_KVP",
    "url": "{{mapproxyUrl}}/service?REQUEST=GetCapabilities&SERVICE=WMTS"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WMTS_BASE",
    "url": "{{mapproxyUrl}}/wmts"
  },
  {
    "name": "{{layerName}}",
    "description": "",
    "protocol": "WFS",
    "url": "{{geoserverUrl}}/wfs?request=GetCapabilities"
  }
]`;

export const getExpectedLinks = (data: ILinkBuilderData): Link[] => {
  const { layerName, geoserverUrl, mapproxyUrl } = data;
  return [
    {
      name: layerName,
      description: '',
      protocol: 'WMS',
      url: `${mapproxyUrl}/service?REQUEST=GetCapabilities`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMS_BASE',
      url: `${mapproxyUrl}/wms`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS',
      url: `${mapproxyUrl}/wmts/1.0.0/WMTSCapabilities.xml`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS_KVP',
      url: `${mapproxyUrl}/service?REQUEST=GetCapabilities&SERVICE=WMTS`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WMTS_BASE',
      url: `${mapproxyUrl}/wmts`,
    },
    {
      name: layerName,
      description: '',
      protocol: 'WFS',
      url: `${geoserverUrl}/wfs?request=GetCapabilities`,
    },
  ];
};
