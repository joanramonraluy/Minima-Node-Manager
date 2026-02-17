export type StatusResponse = {
  version: string;
  uptime: string;
  locked: string;
  length: number;
  weight: string;
  minima: string;
  coins: string;
  data: string;
  memory: {
    ram: string;
    disk: string;
    files: {
      txpowdb: string;
      archivedb: string;
      cascade: string;
      chaintree: string;
      wallet: string;
      userdb: string;
      p2pdb: string;
    };
  };
  chain: {
    block: number;
    time: string;
    hash: string;
    speed: number;
    difficulty: string;
    size: number;
    length: number;
    branches: number;
    weight: string;
    cascade: {
      start: number;
      length: number;
      weight: string;
    };
  };
  txpow: {
    mempool: number;
    ramdb: number;
    txpowdb: number;
    archivedb: number;
  };
  network: {
    host: string;
    hostset: boolean;
    port: number;
    connecting: number;
    connected: number;
    rpc: {
      enabled: boolean;
      port: number;
    };
    p2p: string;
    traffic: {
      from: string;
      totalread: string;
      totalwrite: string;
      breakdown: {
        reads: {
          NIO_handleRead: string;
          sendMaxPacket: string;
        };
        writes: {
          sendMaxPacket: string;
          NIO_handleWrite: string;
        };
      };
      read: string;
      write: string;
    };
  };
};

export type MaxContactsResponse = {
  allowallcontacts: boolean;
  contacts: {
    id: number;
    lastseen: number;
    myaddress: string;
    chaintip: string;
    currentaddess: string;
    publickey: string;
    samechain: boolean;
    extradata: {
      checkblock: string;
      checkhash: string;
      minimaaddress: string;
      mls: string;
      name: string;
      topblock: string;
    };
  }[];
};

export type MDSResponse = {
  connect: string;
  enabled: boolean;
  password: string;
  minidapps: {
    uid: string;
    conf: {
      browser: string;
      description: string;
      icon: string;
      name: string;
      permission: string;
      version: string;
    };
  }[];
};

export type MaximaResponse = {
  contact: string;
  localidentity: string;
  logs: boolean;
  mls: string;
  name: string;
  p2pidentity: string;
  poll: number;
  publickey: string;
  staticmls: boolean;
};

export type BlockResponse = {
  block: string;
  date: string;
  timemilli: string;
};

export type NetworkResponse = {
  connections: {
    welcome: string;
    uid: string;
    incoming: boolean;
    host: string;
    port: number;
    minimaport: number;
    isconnected: boolean;
    valid: boolean;
    connected: string;
  }[];
  details: {
    host: string;
    hostset: boolean;
    port: number;
    connecting: number;
    connected: number;
    rpc: {
      enabled: boolean;
      port: number;
    };
    p2p: {
      address: string;
      isAcceptingInLinks: boolean;
      numInLinks: number;
      numOutLinks: number;
      numNotAcceptingConnP2PLinks: number;
      numNoneP2PLinks: number;
      numKnownPeers: number;
      numUnvalidatedPeers: number;
      numAllLinks: number;
      nio_inbound: number;
      nio_outbound: number;
    };
    traffic: {
      from: string;
      totalread: string;
      totalwrite: string;
      breakdown: {
        reads: {
          [key: string]: string;
        };
        writes: {
          [key: string]: string;
        };
      };
      read: string;
      write: string;
    };
  };
};
