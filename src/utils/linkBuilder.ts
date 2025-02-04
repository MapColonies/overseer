import { readFileSync } from 'fs';
import { Link } from '@map-colonies/mc-model-types';
import { inject, injectable } from 'tsyringe';
import type { IConfig } from 'config';
import { compile } from 'handlebars';
import { SERVICES } from '../common/constants';

export interface ILinkBuilderData {
  layerName: string;
  mapproxyDns: string;
  geoserverDns: string;
}

@injectable()
export class LinkBuilder {
  private readonly compiledTemplate: HandlebarsTemplateDelegate;

  public constructor(@inject(SERVICES.CONFIG) private readonly config: IConfig) {
    const templatePath = this.config.get<string>('linkTemplatesPath');
    const template = readFileSync(templatePath, { encoding: 'utf8' });
    this.compiledTemplate = compile(template, { noEscape: true });
  }

  public createLinks(data: ILinkBuilderData): Link[] {
    const linksJson = this.compiledTemplate(data);
    const links = JSON.parse(linksJson) as Link[];
    return links;
  }
}
