import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';

import * as Model from '../services/model.service';

import { EventHubConsumerClient, earliestEventPosition, latestEventPosition } from "@azure/event-hubs";
import { receiveMessageOnPort } from 'worker_threads';
import { ROUTER_CONFIGURATION } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class EventHubSourceService implements Model.IFirewallSource {
  private DATA: Array<Model.FirewallDataRow> = [];

  constructor(
    private model:Model.ModelService,
    private datePipe: DatePipe)  {
  }
  private defaultSleepTime: number = 1500;
  private consumerClient: EventHubConsumerClient | undefined;
  private subscription: any;

  public skippedRows: number = 0;
  public onDataArrived?: (data: Array<Model.FirewallDataRow>) => void;
  public onRowSkipped?: (skipped: number) => void;
  public onMessageArrived?: ((message: string) => void);

  public async connect() {

    try {
      this.outputMessage(`connecting consumerClient to azure event hub`);
      await new Promise(resolve => setTimeout(resolve, this.defaultSleepTime));
      this.consumerClient = new EventHubConsumerClient(this.model.eventHubConsumerGroup, this.model.eventHubConnection);
      
      this.outputMessage(`connected! getting partitionIds`);
      await new Promise(resolve => setTimeout(resolve, this.defaultSleepTime));
      const partitionIds = await this.consumerClient.getPartitionIds();
      
      this.outputMessage(`done! reading events from partitions: ${partitionIds.join(", ")}`);
      await new Promise(resolve => setTimeout(resolve, this.defaultSleepTime));

      this.subscription = this.consumerClient.subscribe( 
        {
          processEvents: async (events, context) => {
            var moreRows:number = 0;

            if (events.length === 0) {
              console.log(`No events received within wait time. Waiting for next interval`);
              return;
            }

            for (const event of events) {
              const eventBody: Model.EventHubBody = event.body;

              for (const record of eventBody.records) {
                const resourceId:string = record.resourceId;

                if (resourceId && resourceId.includes("/PROVIDERS/MICROSOFT.NETWORK/AZUREFIREWALLS/") == true) {
                  var row: Model.FirewallDataRow | undefined = undefined;

                  switch (record.category) {
                    case "AzureFirewallNetworkRule":
                    case "AzureFirewallApplicationRule":
                    case "AzureFirewallDnsProxy":    {
                      row = this.parseAzureFirewallRule(record);
                      break;
                    }
                    default: {
                      row = {
                        time: record.time.toString(),
                        category: "SKIPPED Category - " + record.category,
                        protocol: "-",
                        sourceip: "-",
                        srcport: "-",
                        targetip: "-",
                        targetport: "-",
                        action: "-",
                        dataRow: record
                      } as Model.FirewallDataRow;

                      this.skippedRows++;
                      this.onRowSkipped?.(this.skippedRows);
                      break;
                    }
                  }
                }
                else {
                  row = {
                    time: record.time.toString(),
                    category: "SKIPPED Res Type - " + resourceId,
                  } as Model.FirewallDataRow;

                  this.skippedRows++;
                  this.onRowSkipped?.(this.skippedRows); 
                }
                moreRows++;
                this.DATA.unshift(row);
              }

              //console.log(`Received event: '${JSON.stringify(event.body)}' from partition: '${context.partitionId}' and consumer group: '${context.consumerGroup}'`);
              this.onDataArrived?.(this.DATA);
              this.onMessageArrived?.( moreRows + " more events received as of " + new Date().toLocaleString());
            }
          },

          processError: async (err, context) => {
            this.outputMessage(`${err.message}`);
            console.log(`${err}`);
          }
        },
        { startPosition: earliestEventPosition, maxBatchSize: 200 }
      );

      // After 30 seconds, stop processing.
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          this.outputMessage(`disconnecting consumerClient and subscription`);
          await this.subscription.close();
          await this.consumerClient?.close();
          resolve();
        }, 300000);
      });
    }
    catch (err: any) {
      this.outputMessage(err.toString());
      throw err;
    }

    
  }

  public async disconnect() {
    await this.consumerClient?.close();
    this.outputLog(`disconnected from azure event hub`);
  }

  public async clear() {
    this.DATA = [];
    this.onDataArrived?.(this.DATA);
    this.outputMessage("Logs successfully deleted!");
  }
    
  private outputLog(text: string): void {
    var date = new Date();
    console.log(`${this.datePipe.transform(date,'hh:mm:ss')} - EventHubSourceService - ${text}\n`);
  }

  private outputMessage (text:string): void {
    this.onMessageArrived?.(text);
    this.outputLog(text);
  }

  private parseAzureFirewallRule(record: Model.AzureFirewallRecord): Model.FirewallDataRow {
    var row: Model.FirewallDataRow;

    switch (record.operationName) {
      case "AzureFirewallNetworkRuleLog": {
        // UDP request from 10.13.1.4:62674 to 10.13.2.4:3389. Action: Allow.
        const split = record.properties.msg.split(" ");
        const ipport1 = split[3].split(":");
        const ipport2 = split[5].split(":");

        row = {
          time: record.time.toString(),
          category: "NetworkRule",
          protocol: split[0],
          sourceip: ipport1[0],
          srcport: ipport1[1],
          targetip: ipport2[0],
          targetport: ipport2[1].replace(".", ""),
          action: split[7].replace(".", ""),
          dataRow: record
        } as Model.FirewallDataRow;    
        break; 
      }
      case "AzureFirewallNatRuleLog": {
        // TCP request from 194.79.199.174:61563 to 20.31.19.13:3389 was DNAT'ed to 10.13.2.4:3389
        const split = record.properties.msg.split(" ");
        const ipport1 = split[3].split(":");
        const ipport2 = split[5].split(":");

        row = {
          time: record.time.toString(),
          category: "NatRule",
          protocol: split[0],
          sourceip: ipport1[0],
          srcport: ipport1[1],
          targetip: ipport2[0],
          targetport: ipport2[1],
          action: split[7],
          dataRow: record
        } as Model.FirewallDataRow;
        
        for (let i = 8; i < split.length; i++) {
          row.action += " " + split[i];
        }
        break; 
      }
      case "AzureFirewallApplicationRuleLog": {
        //"HTTPS request from 10.13.1.4:55611 to md-zz400hv4xnwl.z32.blob.storage.azure.net:443. Action: Deny. No rule matched. Proceeding with default action"
        //"HTTPS request from 10.13.1.4:55583 to winatp-gw-cus3.microsoft.com:443. Action: Deny. Policy: my-policy. Rule Collection Group: DefaultApplicationRuleCollectionGroup. Rule Collection: block-sites. Rule: block-microsoft"
        //"HTTP  request from 10.13.1.4:55202 to au.download.windowsupdate.com:80. Url: au.download.windowsupdate.com/c/msdownload/update/software/updt/2021/01/windows10.0-kb4589208-v2-x64_c7af21cdf923f050a3dc8e7924c0245ee651da56.cab. Action: Deny. No rule matched. Proceeding with default action"
  
        row = {} as Model.FirewallDataRow;
        
        const splitStops = record.properties.msg.split(". ");
        const splitSpaces = record.properties.msg.substring(6).split(" ");
        const ipport1 = splitSpaces[2].split(":");
        const ipport2 = splitSpaces[4].split(":");

        row.time = record.time.toString();
        row.category = "ApplicationRule";
        row.protocol = splitStops[0].split(" ")[0];
        row.policy ="";

        row.sourceip = ipport1[0];
        row.srcport = ipport1[1];
        row.targetip = ipport2[0];
        row.targetport = ipport2[1];
        row.dataRow = record;

        splitStops.forEach((sentence, index) => {
          var words = sentence.split(": ");
          switch (words[0]) {
            case "Action":{
              row.action = words[1];
              break;
            }
            case "Policy": {
              break;
            }
            case "Rule Collection Group":
            case "Rule Collection": 
            case "Rule": {
              row.policy += ">" + words[1];
              break;
            }
            case "Url": {
              row.targetUrl = words[1];
              break;
            }
            case "No rule matched. Proceeding with default action": {
              row.policy = "N/A";
              break;
            }
          }           
        });

        if (row.policy.startsWith(">")) {
          row.policy = row.policy.substring(1);
        }

        break; 
      }
      case "AzureFirewallDnsProxyLog": {
        //  "DNS Request: 10.12.3.5:7943 - 8951 AAAA IN tsfe.trafficshaping.dsp.mp.microsoft.com. udp 58 false 512 NOERROR qr,rd,ra 135 0.004987569s"
        //     " Error: 2 time.windows.com.reddog.microsoft.com. A: read udp 10.0.1.5:49126->168.63.129.160:53: i/o timeout”

        const split = record.properties.msg.split(" ");

        row = {} as Model.FirewallDataRow;
        row.time = record.time.toString();
        row.category = "DnsProxy";
        row.action = split[1].replace(":", "");
        row.sourceip = split[2].split(":")[0];
        row.srcport = split[2].split(":")[1];
        row.protocol = split[8];        
        row.targetUrl = split[5] + " " + split[6] + " " + split[7];
        
        row.dataRow = record;

        break;
      }
      default: {
        row = {
          time: record.time.toString(),
          category: "SKIPPED - UNMANAGED SUB Operation Name - " + record.category,
          protocol: "-",
          sourceip: "-",
          srcport: "-",
          targetip: "-",
          targetport: "-",
          action: "-",
          dataRow: record
        } as Model.FirewallDataRow;

        this.skippedRows++;
        this.onRowSkipped?.(this.skippedRows);
        break; 
      }
    }

    return row;
  }
}
